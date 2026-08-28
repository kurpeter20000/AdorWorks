"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole, CLIENT_ROLES } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";
import type { FormState } from "./auth";

/**
 * Stage 5: employer invitations (0050) — distinct from Stage 4's
 * addCandidateToShortlist. An invitation is outreach the talent can say
 * no to; only acceptance creates a real `applications` row.
 */

const InviteSchema = z.object({
  message: z.string().trim().max(1000).optional(),
});

export async function inviteTalent(
  opportunityId: string,
  talentId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState & { success?: boolean }> {
  const session = await requireRole(...CLIENT_ROLES);

  const validated = InviteSchema.safeParse({ message: formData.get("message") || undefined });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("invitations").insert({
    opportunity_id: opportunityId,
    talent_id: talentId,
    invited_by: session.userId,
    message: validated.data.message || null,
  });
  if (error) {
    if (error.code === "23505") return { message: "Already invited to this opportunity." };
    return { message: `Could not send this invitation: ${error.message}` };
  }

  revalidatePath(`/organisation/opportunities/${opportunityId}`);
  return { success: true };
}

/**
 * Accept: creates the real application (source='invited', stage=
 * 'submitted' — same starting point as a self-initiated application,
 * since the talent is the one actually agreeing to be considered) and
 * marks the invitation accepted, both via the admin client after an
 * explicit ownership + status check — same pattern as offers.ts's
 * acceptOffer/declineOffer, and for the same reason: this is a
 * privileged, multi-table action, not a plain client PATCH.
 */
export async function acceptInvitation(invitationId: string): Promise<{ error?: string }> {
  const session = await requireRole("talent");
  const admin = createAdminClient();

  const { data: invitation } = await admin.from("invitations").select("*").eq("id", invitationId).maybeSingle();
  if (!invitation || invitation.talent_id !== session.userId) {
    return { error: "Invitation not found." };
  }
  if (invitation.status !== "pending") {
    return { error: "This invitation has already been responded to." };
  }

  const { error: inviteError } = await admin
    .from("invitations")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", invitationId);
  if (inviteError) return { error: inviteError.message };

  const { error: appError } = await admin.from("applications").insert({
    opportunity_id: invitation.opportunity_id,
    talent_id: invitation.talent_id,
    source: "invited",
    stage: "submitted",
  });
  if (appError && appError.code !== "23505") {
    return { error: appError.message };
  }

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.APPLICATION_SUBMITTED,
    actorId: session.userId,
    entityType: "invitations",
    entityId: invitationId,
    source: "platform",
    metadata: { opportunityId: invitation.opportunity_id, via: "invitation_accepted" },
  });

  revalidatePath("/opportunities/invited");
  revalidatePath("/applications");
  return {};
}

export async function declineInvitation(invitationId: string): Promise<{ error?: string }> {
  const session = await requireRole("talent");
  const admin = createAdminClient();

  const { data: invitation } = await admin.from("invitations").select("id, talent_id, status").eq("id", invitationId).maybeSingle();
  if (!invitation || invitation.talent_id !== session.userId) {
    return { error: "Invitation not found." };
  }
  if (invitation.status !== "pending") {
    return { error: "This invitation has already been responded to." };
  }

  const { error } = await admin
    .from("invitations")
    .update({ status: "declined", responded_at: new Date().toISOString() })
    .eq("id", invitationId);
  if (error) return { error: error.message };

  revalidatePath("/opportunities/invited");
  return {};
}
