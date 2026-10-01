"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole, STAFF_ROLES } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";
import { notifyUser, NOTIFICATION_TYPES } from "@/lib/domain/notifications";
import { DISPUTE_OUTCOMES } from "@/lib/domain/disputes";
import type { DisputeRow } from "@/lib/database.types";

const Schema = z
  .object({
    status: z.enum(["open", "investigating", "resolved", "escalated"]),
    resolution: z.string().trim().max(4000).optional(),
    outcome: z.enum(DISPUTE_OUTCOMES).optional(),
    outcomeSummary: z.string().trim().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.status === "resolved" && !v.outcome) {
      ctx.addIssue({ code: "custom", path: ["outcome"], message: "Choose the outcome before resolving." });
    }
    if (v.status === "resolved" && (!v.outcomeSummary || v.outcomeSummary.length < 10)) {
      ctx.addIssue({ code: "custom", path: ["outcomeSummary"], message: "Write a short summary both sides will see (at least 10 characters)." });
    }
  });

export type DisputeUpdate = z.input<typeof Schema>;

/**
 * Staff update a dispute (Stage 16 step 2). Resolving requires an outcome
 * and a short summary the two parties see; the database (0097) refuses a
 * resolution without an outcome too. Resolving a contract dispute
 * un-pauses the contract; resolving or escalating notifies everyone
 * involved and is audited — same side effects the staff API had.
 */
export async function updateDispute(disputeId: string, input: DisputeUpdate): Promise<{ error?: string }> {
  const session = await requireRole(...STAFF_ROLES);
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join(" ") };
  const v = parsed.data;

  const admin = createAdminClient();
  const { data: before } = await admin.from("disputes").select("status, outcome").eq("id", disputeId).maybeSingle();
  if (!before) return { error: "Dispute not found." };

  const patch: Partial<DisputeRow> = { status: v.status, resolution: v.resolution || null };
  if (v.status === "resolved") {
    patch.outcome = v.outcome;
    patch.outcome_summary = v.outcomeSummary;
    patch.resolved_by = session.userId;
    patch.resolved_at = new Date().toISOString();
  }
  const { data, error } = await admin.from("disputes").update(patch).eq("id", disputeId).select("*").single();
  if (error || !data) return { error: error?.message ?? "Could not update the dispute." };

  if (v.status === "resolved" || v.status === "escalated") {
    await logAuditEvent(admin, {
      name: v.status === "resolved" ? DOMAIN_EVENTS.DISPUTE_RESOLVED : DOMAIN_EVENTS.DISPUTE_ESCALATED,
      actorId: session.userId,
      entityType: "disputes",
      entityId: disputeId,
      source: "platform",
      reason: v.outcomeSummary ?? v.resolution ?? null,
      before: { status: before.status, outcome: before.outcome },
      after: { status: v.status, outcome: v.outcome ?? null },
      metadata: { contract_id: data.contract_id ?? null, engagement_id: data.engagement_id ?? null },
    });

    if (v.status === "resolved" && data.contract_id) {
      await admin.from("contracts").update({ status: "active" }).eq("id", data.contract_id).eq("status", "disputed");
    }

    const { data: contract } = data.contract_id
      ? await admin.from("contracts").select("talent_id, organisation_id").eq("id", data.contract_id).maybeSingle()
      : { data: null };
    const { data: org } = contract
      ? await admin.from("organisations").select("representative_id").eq("id", contract.organisation_id).maybeSingle()
      : { data: null };
    const recipients = [data.raised_by, contract?.talent_id, org?.representative_id].filter(
      (id, i, arr): id is string => !!id && arr.indexOf(id) === i
    );
    for (const userId of recipients) {
      await notifyUser(admin, {
        userId,
        type: v.status === "resolved" ? NOTIFICATION_TYPES.DISPUTE_RESOLVED : NOTIFICATION_TYPES.DISPUTE_ESCALATED,
        title: v.status === "resolved" ? "A dispute on your contract was resolved" : "A dispute on your contract was escalated",
        body: v.outcomeSummary ?? v.resolution ?? undefined,
        link: data.contract_id ? `/contracts/${data.contract_id}` : undefined,
      });
    }
  }

  if (data.contract_id) revalidatePath(`/contracts/${data.contract_id}`);
  return {};
}
