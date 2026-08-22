"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSession, requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FormState } from "./auth";
import type { TalentProfileRow } from "@/lib/database.types";
import { ASSISTED_TALENT_FIELDS } from "@/lib/assistedFields";

const RequestSchema = z.object({
  reason: z.string().trim().min(5, "Tell us briefly what you need help with."),
  preferredChannel: z.string().trim().optional(),
});

/**
 * Works both signed-in and signed-out — assistance_requests_insert's RLS
 * is `with check (true)` specifically so someone with no account yet can
 * submit one. Signed-in callers get requested_by set so the request is
 * already linked to their account; signed-out callers leave it null,
 * which is what start-session (backend/api) checks to decide whether
 * account provisioning (Stage B, not built yet) is needed.
 */
export async function submitAssistanceRequest(_prevState: FormState, formData: FormData): Promise<FormState> {
  const validated = RequestSchema.safeParse({
    reason: formData.get("reason"),
    preferredChannel: formData.get("preferredChannel") || undefined,
  });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }
  const v = validated.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("assistance_requests").insert({
    requested_by: user?.id ?? null,
    reason: v.reason,
    preferred_channel: v.preferredChannel || null,
  });
  if (error) {
    return { message: `Could not submit your request: ${error.message}` };
  }

  return {};
}

/**
 * The assisted person consenting to their own pending_consent session —
 * this is the one write in the whole flow that must come from the
 * assisted person's own SSR-scoped session (assistance_sessions_update's
 * RLS only allows user_id = auth.uid() or staff), not the admin client.
 */
export async function consentToAssistance(sessionId: string): Promise<FormState> {
  const session = await requireSession();

  const supabase = await createClient();
  const { error } = await supabase
    .from("assistance_sessions")
    .update({ status: "active", consent_recorded_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", session.userId)
    .eq("status", "pending_consent");
  if (error) {
    return { message: `Could not record your consent: ${error.message}` };
  }

  revalidatePath("/dashboard");
  return {};
}

const FieldUpdateSchema = z.object({
  sessionId: z.string().uuid(),
  field: z.enum(ASSISTED_TALENT_FIELDS),
  value: z.string(),
});

/**
 * The actual authorization boundary for assisted edits — RLS grants an
 * agent no direct UPDATE on talent_profiles at all (by design, see
 * migration 0007's comments), so this uses the admin client after
 * re-verifying, itself, that the session is active, belongs to this
 * agent, and the field is in scope. Same "service-role-mediated,
 * business-rule-gated Server Action" pattern as offers.ts/contracts.ts.
 */
export async function updateAssistedField(_prevState: FormState, formData: FormData): Promise<FormState> {
  const agentSession = await requireRole("onboarding_agent");

  const validated = FieldUpdateSchema.safeParse({
    sessionId: formData.get("sessionId"),
    field: formData.get("field"),
    value: formData.get("value") ?? "",
  });
  if (!validated.success) {
    return { message: "Invalid field update." };
  }
  const { sessionId, field, value } = validated.data;

  const admin = createAdminClient();

  const { data: assistSession } = await admin
    .from("assistance_sessions")
    .select("id, agent_id, user_id, status, scope")
    .eq("id", sessionId)
    .maybeSingle();
  if (!assistSession || assistSession.status !== "active" || assistSession.agent_id !== agentSession.userId) {
    return { message: "This session is no longer active." };
  }
  if (!assistSession.scope.fields.includes(field)) {
    return { message: `"${field}" isn't in this session's scope.` };
  }

  const { data: before } = await admin
    .from("talent_profiles")
    .select(field)
    .eq("id", assistSession.user_id)
    .maybeSingle();
  const oldValue = before ? JSON.stringify((before as Record<string, unknown>)[field] ?? null) : null;

  const newValue = field === "skills" || field === "languages" ? splitList(value) : value;
  const { error: updateError } = await admin
    .from("talent_profiles")
    .update({ [field]: newValue } as Partial<TalentProfileRow>)
    .eq("id", assistSession.user_id);
  if (updateError) {
    return { message: `Could not save this field: ${updateError.message}` };
  }

  // Uses the agent's OWN client (not admin) — assisted_field_changes_insert's
  // is_assigned_active_agent() check is exactly built for this, and using
  // the agent's real session here means the audit row's authorization is
  // provably real, not just asserted by an admin-client write.
  const supabase = await createClient();
  await supabase.from("assisted_field_changes").insert({
    session_id: sessionId,
    field_table: "talent_profiles",
    field_name: field,
    old_value: oldValue,
    new_value: JSON.stringify(newValue),
  });

  revalidatePath(`/assist/${sessionId}`);
  return {};
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function finishAssistanceSession(sessionId: string): Promise<void> {
  const agentSession = await requireRole("onboarding_agent");

  const admin = createAdminClient();
  await admin
    .from("assistance_sessions")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("agent_id", agentSession.userId);

  revalidatePath("/assist");
}
