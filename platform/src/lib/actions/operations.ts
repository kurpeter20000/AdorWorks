"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole, STAFF_ROLES } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";
import { notifyUser, NOTIFICATION_TYPES } from "@/lib/domain/notifications";
import type { FormState } from "./auth";

/**
 * Staff review actions for opportunities pending_review -> open/rejected/
 * changes_required. Every one of these transitions (plus approved_by/
 * approved_at) is already restricted to staff by RLS and the
 * guard_opportunities_update trigger (backend/supabase/migrations/0043) --
 * this is the first UI that actually exercises that existing permission,
 * not a new grant.
 *
 * opportunities has no FK relationship declared in database.types.ts
 * (Relationships: []), so organisation lookups are a second query rather
 * than a PostgREST embed, same as every other page in this codebase that
 * joins opportunities to organisations (e.g. app/dashboard/page.tsx).
 */
async function loadOpportunityForReview(opportunityId: string) {
  const supabase = await createClient();
  const { data: opportunity } = await supabase
    .from("opportunities")
    .select("id, title, status, organisation_id")
    .eq("id", opportunityId)
    .maybeSingle();
  if (!opportunity) return null;

  const { data: organisation } = await supabase
    .from("organisations")
    .select("representative_id")
    .eq("id", opportunity.organisation_id)
    .maybeSingle();

  return { opportunity, representativeId: organisation?.representative_id ?? null };
}

function revalidateOpportunity(opportunityId: string) {
  revalidatePath("/operations");
  revalidatePath("/operations/opportunities");
  revalidatePath(`/operations/opportunities/${opportunityId}`);
  // The employer's own view of this same row already renders
  // rejection_reason/status_note (organisation/opportunities/[id]/page.tsx)
  // -- it's just never had a way to get populated until now.
  revalidatePath(`/organisation/opportunities/${opportunityId}`);
}

export async function approveOpportunity(opportunityId: string): Promise<FormState> {
  const session = await requireRole(...STAFF_ROLES);

  const found = await loadOpportunityForReview(opportunityId);
  if (!found) return { message: "Opportunity not found." };
  if (found.opportunity.status !== "pending_review") {
    return { message: "This opportunity is no longer waiting for review." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("opportunities")
    .update({ status: "open", approved_by: session.userId, approved_at: new Date().toISOString() })
    .eq("id", opportunityId);
  if (error) return { message: `Could not publish this opportunity: ${error.message}` };

  const admin = createAdminClient();
  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.OPPORTUNITY_PUBLISHED,
    actorId: session.userId,
    entityType: "opportunities",
    entityId: opportunityId,
    source: "platform",
  });
  if (found.representativeId) {
    await notifyUser(admin, {
      userId: found.representativeId,
      type: NOTIFICATION_TYPES.OPPORTUNITY_PUBLISHED,
      title: "Your opportunity is live",
      body: `"${found.opportunity.title}" has been approved and published.`,
      link: `/organisation/opportunities/${opportunityId}`,
    });
  }

  revalidateOpportunity(opportunityId);
  return {};
}

const ReasonSchema = z.object({
  reason: z.string().trim().min(10, "Give at least a short explanation so the employer knows what to fix."),
});

export async function rejectOpportunity(
  opportunityId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireRole(...STAFF_ROLES);

  const validated = ReasonSchema.safeParse({ reason: formData.get("reason") });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const found = await loadOpportunityForReview(opportunityId);
  if (!found) return { message: "Opportunity not found." };
  if (found.opportunity.status !== "pending_review") {
    return { message: "This opportunity is no longer waiting for review." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("opportunities")
    .update({ status: "rejected", rejection_reason: validated.data.reason })
    .eq("id", opportunityId);
  if (error) return { message: `Could not reject this opportunity: ${error.message}` };

  const admin = createAdminClient();
  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.OPPORTUNITY_REJECTED,
    actorId: session.userId,
    entityType: "opportunities",
    entityId: opportunityId,
    source: "platform",
    reason: validated.data.reason,
  });
  if (found.representativeId) {
    await notifyUser(admin, {
      userId: found.representativeId,
      type: NOTIFICATION_TYPES.OPPORTUNITY_REJECTED,
      title: "An opportunity was not approved",
      body: `"${found.opportunity.title}" was not approved: ${validated.data.reason}`,
      link: `/organisation/opportunities/${opportunityId}`,
    });
  }

  revalidateOpportunity(opportunityId);
  return {};
}

const NoteSchema = z.object({
  note: z.string().trim().min(10, "Explain what needs to change so the employer can fix it."),
});

export async function requestOpportunityChanges(
  opportunityId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireRole(...STAFF_ROLES);

  const validated = NoteSchema.safeParse({ note: formData.get("note") });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const found = await loadOpportunityForReview(opportunityId);
  if (!found) return { message: "Opportunity not found." };
  if (found.opportunity.status !== "pending_review") {
    return { message: "This opportunity is no longer waiting for review." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("opportunities")
    .update({ status: "changes_required", status_note: validated.data.note })
    .eq("id", opportunityId);
  if (error) return { message: `Could not request changes: ${error.message}` };

  const admin = createAdminClient();
  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.OPPORTUNITY_CHANGES_REQUESTED,
    actorId: session.userId,
    entityType: "opportunities",
    entityId: opportunityId,
    source: "platform",
    reason: validated.data.note,
  });
  if (found.representativeId) {
    await notifyUser(admin, {
      userId: found.representativeId,
      type: NOTIFICATION_TYPES.OPPORTUNITY_CHANGES_REQUESTED,
      title: "Changes requested on your opportunity",
      body: `"${found.opportunity.title}" needs changes before it can be published: ${validated.data.note}`,
      link: `/organisation/opportunities/${opportunityId}/edit`,
    });
  }

  revalidateOpportunity(opportunityId);
  return {};
}
