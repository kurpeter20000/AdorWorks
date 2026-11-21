import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { FeeBreakdown } from "@/lib/domain/fees";
import { disputeWindowEndsAt } from "@/lib/domain/escrow";
import { getCollectionAccounts, getEscrowSettings } from "@/lib/dal/settings";
import { describeCollectionAccount } from "@/lib/domain/collectionAccounts";
import { notifyUser, NOTIFICATION_TYPES } from "@/lib/domain/notifications";
import { sendEmailSafely, getUserEmail } from "@/lib/email";
import { renderEmail } from "@/lib/emailTemplate";
import { buildUnsubscribeUrl } from "@/lib/unsubscribeToken";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";
import { nextReceiptNumber } from "./receiptNumber";

type Admin = ReturnType<typeof createAdminClient>;

export interface SettledMilestonePayment {
  actorId: string;
  contractId: string;
  talentId: string;
  milestoneId: string;
  intentionId: string;
  invoiceId: string | null;
  provider: "mtn_momo" | "mgurush" | "bank_transfer";
  /** The provider's transaction id, or the bank's reference for a transfer. */
  externalReference: string;
  payerPhone: string | null;
  /** The agreed (milestone) amount; fees are in `fee`. */
  amount: number;
  currency: string;
  fee: FeeBreakdown;
  isSimulated: boolean;
  /** 0117: the AdorWorks account it landed in. Worked out here for mobile money; the bank flows pass it. */
  receivedInto?: string | null;
}

/**
 * Records a milestone payment whose money has already arrived — a
 * mobile-money charge that went through, or a bank transfer finance has
 * seen land — and does everything that follows: the payment_events row
 * and receipt, the intention/invoice/milestone status changes, the audit
 * trail and the talent's notice.
 *
 * Returns ok:false only when the payment_events row itself couldn't be
 * written; the caller decides what that means for its intention (a
 * mobile-money charge needs reconciling by hand; a bank transfer goes
 * back to awaiting confirmation). Failures after that point are logged,
 * not returned: the payment is recorded and must not be retried.
 */
export async function finalizeMilestonePayment(
  admin: Admin,
  p: SettledMilestonePayment
): Promise<{ ok: true; receiptNumber: string } | { ok: false; error: string }> {
  // Escrow (0099): read once, here — switching it mid-flight never
  // changes an already-held payment's window.
  const escrow = await getEscrowSettings();
  const escrowEndsAt = escrow.enabled ? disputeWindowEndsAt(escrow) : null;
  const receiptNumber = await nextReceiptNumber(admin, p.intentionId);
  let receivedInto = p.receivedInto ?? null;
  if (p.receivedInto === undefined && p.provider !== "bank_transfer") {
    receivedInto = describeCollectionAccount(p.provider, (await getCollectionAccounts())[p.provider]);
  }

  const { error: paymentError } = await admin.from("payment_events").insert({
    milestone_id: p.milestoneId,
    contract_id: p.contractId,
    intention_id: p.intentionId,
    invoice_id: p.invoiceId,
    provider_name: p.provider,
    external_reference: p.externalReference,
    payer_phone: p.payerPhone,
    receipt_number: receiptNumber,
    received_into: receivedInto,
    amount: p.amount,
    currency: p.currency,
    fee_percent: p.fee.talentFeePercent,
    fee_amount: p.fee.talentFeeAmount,
    net_amount: p.fee.netAmount,
    employer_fee_percent: p.fee.employerFeePercent,
    employer_fee_amount: p.fee.employerFeeAmount,
    total_charged: p.fee.totalCharged,
    is_simulated: p.isSimulated,
    escrow_status: escrow.enabled ? "held" : "not_applicable",
    dispute_window_ends_at: escrowEndsAt ? escrowEndsAt.toISOString() : null,
  });
  if (paymentError) return { ok: false, error: paymentError.message };

  const { error: intentionUpdateError } = await admin
    .from("payment_intentions")
    .update({ status: "succeeded", resolved_at: new Date().toISOString() })
    .eq("id", p.intentionId);
  if (intentionUpdateError) {
    console.error("finalizeMilestonePayment: payment %s recorded but the intention update failed:", p.intentionId, intentionUpdateError.message);
  }
  if (p.invoiceId) {
    const { error: invoiceError } = await admin.from("finance_records").update({ status: "confirmed" }).eq("id", p.invoiceId);
    if (invoiceError) console.error("finalizeMilestonePayment: failed to confirm finance_records %s:", p.invoiceId, invoiceError.message);
  }
  const { error: milestoneError } = await admin.from("milestones").update({ status: "paid" }).eq("id", p.milestoneId);
  if (milestoneError) {
    console.error("finalizeMilestonePayment: payment recorded for milestone %s but marking it 'paid' failed:", p.milestoneId, milestoneError.message);
  }

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.PAYMENT_STATUS_CHANGED,
    actorId: p.actorId,
    entityType: "payment_events",
    entityId: p.intentionId,
    source: "platform",
    after: {
      status: "succeeded",
      receiptNumber,
      amount: p.amount,
      totalCharged: p.fee.totalCharged,
      platformRevenue: p.fee.platformRevenue,
      currency: p.currency,
      isSimulated: p.isSimulated,
    },
    metadata: { contractId: p.contractId, milestoneId: p.milestoneId, provider: p.provider },
  });
  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.MILESTONE_STATUS_CHANGED,
    actorId: p.actorId,
    entityType: "milestones",
    entityId: p.milestoneId,
    source: "platform",
    before: { status: "approved" },
    after: { status: "paid" },
    metadata: { contractId: p.contractId, receiptNumber },
  });

  // When escrow holds the payout the talent hasn't received the money yet,
  // so "you were paid" would be false. Either way the money reaches them
  // through AdorWorks sending it to the payout method they chose.
  const { currency, fee } = p;
  const amountSummary = `${currency} ${fee.netAmount.toLocaleString()} net (${currency} ${p.amount.toLocaleString()} agreed${fee.talentFeeAmount > 0 ? `, ${currency} ${fee.talentFeeAmount.toLocaleString()} AdorWorks fee` : ""})`;
  const title = escrow.enabled ? "Payment received — held briefly before payout" : "Your client has paid";
  const body = escrow.enabled
    ? `${amountSummary} received and held until ${escrowEndsAt!.toLocaleDateString()} (AdorWorks' dispute window). Unless a dispute is raised, AdorWorks then sends it to the payout method you chose under Finance. Receipt ${receiptNumber}.`
    : `${amountSummary}. AdorWorks will send it to the payout method you chose under Finance. Receipt ${receiptNumber}.`;
  await notifyUser(admin, {
    userId: p.talentId,
    type: NOTIFICATION_TYPES.MILESTONE_PAID,
    title,
    body,
    link: `/contracts/${p.contractId}`,
    dedupeKey: p.milestoneId,
  });
  const talentEmail = await getUserEmail(admin, p.talentId);
  await sendEmailSafely(
    talentEmail,
    `${title} — AdorWorks`,
    renderEmail({
      heading: title,
      paragraphs: [body],
      ctaLabel: "View contract",
      ctaUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/contracts/${p.contractId}`,
      unsubscribeUrl: buildUnsubscribeUrl(p.talentId),
    }),
    { admin, recipientUserId: p.talentId }
  );

  return { ok: true, receiptNumber };
}
