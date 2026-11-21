"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole, CLIENT_ROLES } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isGuaranteeEnabled } from "@/lib/dal/settings";
import { guaranteeWindowEnds, GUARANTEE_TERMS_VERSION } from "@/lib/domain/guarantee";
import { staffAreaRoles } from "@/lib/domain/staffAccess";
import { notifyUser, NOTIFICATION_TYPES } from "@/lib/domain/notifications";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";
import { msg } from "@/i18n/config";
import type { FormState } from "./auth";

/**
 * Employer Guarantee (0120). Switched off until counsel approves the
 * wording; every action refuses while it's off.
 */

const RequestSchema = z.object({
  reason: z.enum(["scope_missed", "left_early", "skills_missing", "other"], { message: msg("Choose what happened.") }),
  details: z.string().trim().min(10, msg("Tell us what happened in a sentence or two.")).max(2000),
});

export async function requestReplacement(contractId: string, _prev: FormState, formData: FormData): Promise<FormState & { sent?: boolean }> {
  const session = await requireRole(...CLIENT_ROLES);
  if (!(await isGuaranteeEnabled())) return { message: msg("The Employer Guarantee isn't available yet.") };
  const parsed = RequestSchema.safeParse({ reason: formData.get("reason"), details: formData.get("details") ?? "" });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const admin = createAdminClient();

  const { data: contract } = await admin
    .from("contracts")
    .select("id, organisation_id, opportunity_id, started_at, status")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract) return { message: msg("Contract not found.") };
  const { data: member } = await admin
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", contract.organisation_id)
    .eq("user_id", session.userId)
    .maybeSingle();
  if (!member || member.role === "viewer") return { message: msg("You don't have permission to manage this contract.") };

  const { data: opportunity } = contract.opportunity_id
    ? await admin.from("opportunities").select("engagement_type, account_contact_id").eq("id", contract.opportunity_id).maybeSingle()
    : { data: null };
  if (guaranteeWindowEnds(contract.started_at, opportunity?.engagement_type) < new Date()) {
    return { message: msg("The Guarantee window for this contract has ended.") };
  }

  const { data: inserted, error } = await admin
    .from("guarantee_requests")
    .insert({ contract_id: contractId, organisation_id: contract.organisation_id, requested_by: session.userId, reason: parsed.data.reason, details: parsed.data.details, status: "open" })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { message: msg("The Guarantee has already been used for this role (one replacement per role).") };
    return { message: error.message };
  }

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.GUARANTEE_REQUESTED,
    actorId: session.userId,
    entityType: "guarantee_requests",
    entityId: inserted.id,
    source: "platform",
    after: { status: "open", reason: parsed.data.reason },
    metadata: { contractId, termsVersion: GUARANTEE_TERMS_VERSION },
  });
  if (opportunity?.account_contact_id) {
    await notifyUser(admin, {
      userId: opportunity.account_contact_id,
      type: NOTIFICATION_TYPES.GUARANTEE_REQUESTED,
      title: "Employer Guarantee request",
      body: "An employer has asked for a replacement under the Guarantee. Reply within 7 days.",
      link: "/operations",
      dedupeKey: inserted.id,
    });
  }
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/operations");
  return { sent: true };
}

const ResolveSchema = z
  .object({
    status: z.enum(["replacement_sent", "credited", "declined", "closed"]),
    note: z.string().trim().max(2000),
  })
  .superRefine((v, ctx) => {
    if (v.status === "declined" && v.note.length < 10) ctx.addIssue({ code: "custom", path: ["note"], message: "Explain why it isn't covered (the employer sees this)." });
  });

/** Staff (matchers and admins) handle a request. */
export async function resolveGuaranteeRequest(requestId: string, _prev: FormState, formData: FormData): Promise<FormState & { done?: boolean }> {
  const session = await requireRole(...staffAreaRoles("opportunities"));
  const parsed = ResolveSchema.safeParse({ status: formData.get("status"), note: formData.get("note") ?? "" });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const admin = createAdminClient();

  const { data: updated, error } = await admin
    .from("guarantee_requests")
    .update({ status: parsed.data.status, staff_note: parsed.data.note || null, resolved_by: session.userId, resolved_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("status", "open")
    .select("id, contract_id, requested_by");
  if (error) return { message: error.message };
  if (!updated?.length) return { message: "Someone else has already handled this request. Refresh the page." };
  const r = updated[0];

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.GUARANTEE_RESOLVED,
    actorId: session.userId,
    entityType: "guarantee_requests",
    entityId: requestId,
    source: "platform",
    before: { status: "open" },
    after: { status: parsed.data.status },
    reason: parsed.data.note || undefined,
  });
  await notifyUser(admin, {
    userId: r.requested_by,
    type: NOTIFICATION_TYPES.GUARANTEE_RESOLVED,
    title: "Update on your Guarantee request",
    body: parsed.data.note || "AdorWorks has updated your Employer Guarantee request.",
    link: `/contracts/${r.contract_id}`,
    dedupeKey: `${requestId}:${parsed.data.status}`,
  });
  revalidatePath("/operations");
  return { done: true };
}

/** Staff: make yourself the named account contact for an opportunity. */
export async function becomeAccountContact(opportunityId: string): Promise<{ error?: string }> {
  const session = await requireRole(...staffAreaRoles("opportunities"));
  const admin = createAdminClient();
  const { error } = await admin.from("opportunities").update({ account_contact_id: session.userId }).eq("id", opportunityId);
  if (error) return { error: error.message };
  revalidatePath(`/organisation/opportunities/${opportunityId}`);
  return {};
}
