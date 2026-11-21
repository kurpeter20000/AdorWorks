"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole, CLIENT_ROLES, FINANCE_ROLES } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateFees, FEES_OFF, type FeeSettings } from "@/lib/domain/fees";
import { notifyUser, NOTIFICATION_TYPES } from "@/lib/domain/notifications";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";
import { finalizeMilestonePayment } from "@/lib/payments/finalizeMilestonePayment";
import type { FormState } from "./auth";

/**
 * Bank transfer, from any bank (0116). payMilestone() leaves an intention
 * 'awaiting_transfer' with a reference; the employer sends the money from
 * their own bank; finance staff see it land on AdorWorks' statement and
 * confirm it here, which records the payment exactly as a mobile-money
 * one would be (finalizeMilestonePayment).
 */

/** The rates quoted when the transfer was started — a later rate change never changes what was owed. */
function quotedFees(snapshot: unknown): FeeSettings {
  if (!snapshot || typeof snapshot !== "object") return FEES_OFF;
  const s = snapshot as Partial<FeeSettings>;
  if (s.enabled !== true) return FEES_OFF;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : 0);
  return { enabled: true, employerPercent: n(s.employerPercent), talentPercent: n(s.talentPercent) };
}

/** The employer changes their mind (or wants to pay by mobile money instead) before sending the money. */
export async function cancelBankTransfer(intentionId: string): Promise<{ error?: string }> {
  const session = await requireRole(...CLIENT_ROLES);
  const admin = createAdminClient();

  const { data: intention } = await admin
    .from("payment_intentions")
    .select("id, contract_id, milestone_id, status, created_by")
    .eq("id", intentionId)
    .maybeSingle();
  if (!intention) return { error: "Transfer not found." };

  const { data: contract } = await admin.from("contracts").select("organisation_id").eq("id", intention.contract_id).maybeSingle();
  const { data: org } = contract
    ? await admin.from("organisations").select("representative_id").eq("id", contract.organisation_id).maybeSingle()
    : { data: null };
  if (!org || org.representative_id !== session.userId) return { error: "You don't have permission to manage this contract." };

  const { data: cancelled, error } = await admin
    .from("payment_intentions")
    .update({ status: "failed", failure_reason: "Cancelled by the employer before the transfer arrived.", resolved_at: new Date().toISOString() })
    .eq("id", intentionId)
    .eq("status", "awaiting_transfer")
    .select("id");
  if (error) return { error: error.message };
  if (!cancelled || cancelled.length === 0) {
    return { error: "This transfer can't be cancelled any more — AdorWorks may already have received it. Refresh the page." };
  }

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.PAYMENT_STATUS_CHANGED,
    actorId: session.userId,
    entityType: "payment_intentions",
    entityId: intentionId,
    source: "platform",
    before: { status: "awaiting_transfer" },
    after: { status: "failed", reason: "cancelled_by_employer" },
    metadata: { contractId: intention.contract_id, milestoneId: intention.milestone_id },
  });
  revalidatePath(`/contracts/${intention.contract_id}`);
  return {};
}

const ConfirmSchema = z.object({
  bankReference: z.string().trim().min(3, "Enter the reference from AdorWorks' bank statement.").max(120),
});

/** Finance staff saw the money arrive on AdorWorks' bank statement. */
export async function confirmBankTransfer(
  intentionId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState & { confirmed?: boolean }> {
  const session = await requireRole(...FINANCE_ROLES);
  const parsed = ConfirmSchema.safeParse({ bankReference: formData.get("bankReference") ?? "" });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const admin = createAdminClient();

  const { data: intention } = await admin
    .from("payment_intentions")
    .select("id, contract_id, milestone_id, invoice_id, status, fee_settings, transfer_reference, created_by")
    .eq("id", intentionId)
    .maybeSingle();
  if (!intention) return { message: "Transfer not found." };
  if (intention.status !== "awaiting_transfer") return { message: "This transfer isn't waiting for confirmation any more. Refresh the page." };

  const { data: existingPayment } = await admin
    .from("payment_events")
    .select("id")
    .eq("milestone_id", intention.milestone_id)
    .eq("status", "succeeded")
    .limit(1);
  if (existingPayment && existingPayment.length > 0) {
    return { message: "This milestone has already been paid another way. Don't confirm it — refund the transfer to the employer instead." };
  }

  const { data: contract } = await admin.from("contracts").select("id, talent_id").eq("id", intention.contract_id).maybeSingle();
  const { data: milestone } = await admin.from("milestones").select("amount, currency").eq("id", intention.milestone_id).maybeSingle();
  if (!contract || !milestone) return { message: "Contract or milestone not found." };

  // Atomic claim: awaiting_transfer -> processing. Two staff confirming
  // the same transfer at once both pass the reads above; only one of
  // these updates matches, the other stops here.
  const { data: claimed, error: claimError } = await admin
    .from("payment_intentions")
    .update({ status: "processing" })
    .eq("id", intentionId)
    .eq("status", "awaiting_transfer")
    .select("id");
  if (claimError) return { message: `Could not confirm the transfer: ${claimError.message}` };
  if (!claimed || claimed.length === 0) return { message: "Someone else has just confirmed this transfer. Refresh the page." };

  const fee = calculateFees(milestone.amount, quotedFees(intention.fee_settings));
  const finalized = await finalizeMilestonePayment(admin, {
    actorId: session.userId,
    contractId: contract.id,
    talentId: contract.talent_id,
    milestoneId: intention.milestone_id,
    intentionId,
    invoiceId: intention.invoice_id,
    provider: "bank_transfer",
    externalReference: parsed.data.bankReference,
    payerPhone: null,
    amount: milestone.amount,
    currency: milestone.currency,
    fee,
    // Staff confirmed real money on a real statement.
    isSimulated: false,
  });
  if (!finalized.ok) {
    // Put it back so it can be confirmed again.
    await admin.from("payment_intentions").update({ status: "awaiting_transfer" }).eq("id", intentionId).eq("status", "processing");
    return { message: `Could not record the payment: ${finalized.error}` };
  }

  await notifyUser(admin, {
    userId: intention.created_by,
    type: NOTIFICATION_TYPES.BANK_TRANSFER_RECEIVED,
    title: "Your bank transfer has arrived",
    body: `AdorWorks received your transfer (reference ${intention.transfer_reference}). The milestone is paid — receipt ${finalized.receiptNumber}.`,
    link: `/contracts/${contract.id}`,
    dedupeKey: intentionId,
  });

  revalidatePath("/operations/invoices");
  return { confirmed: true };
}
