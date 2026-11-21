"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole, FINANCE_ROLES } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActivePayoutProvider } from "@/lib/payoutProviders.server";
import { notifyUser, NOTIFICATION_TYPES } from "@/lib/domain/notifications";
import { sendEmailSafely, getUserEmail } from "@/lib/email";
import { renderEmail } from "@/lib/emailTemplate";
import { buildUnsubscribeUrl } from "@/lib/unsubscribeToken";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";
import { describePayoutMethod, type PayoutMethodRow } from "@/lib/domain/payoutMethods";
import { nextReceiptNumber } from "@/lib/payments/receiptNumber";
import type { FormState } from "./auth";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Paying talent (Stage 16 step 4, reworked in 0116).
 *
 * Every milestone payment comes in to AdorWorks first, then goes out to
 * the talent by the payout method THEY chose under Finance
 * (talent_payout_methods, 0114):
 *   - MTN Mobile Money: sent automatically through the MTN disbursement
 *     seam (simulated while ADORWORKS_FF_REAL_PAYMENTS is off) when staff
 *     click "Send payout" — sendPayout().
 *   - mGurush and bank transfer (any bank): finance staff send the money
 *     themselves, then record it here with the transaction reference —
 *     recordManualPayout(). These partners' systems aren't connected yet.
 *
 * A payment is due once its escrow dispute window has passed with no
 * open dispute — or straight away when escrow was off when it was paid.
 * Staff-triggered rather than automatic: there's no scheduled job that
 * can make the outbound call (see migration 0099's comment).
 */

interface PayablePayment {
  id: string;
  contract_id: string;
  net_amount: number;
  currency: string;
  escrow_status: "not_applicable" | "held" | "released";
  payout_attempts: number;
  disbursement_status: "pending" | "succeeded" | "failed" | null;
  payout_last_attempt_at: string | null;
  talentId: string;
  method: PayoutMethodRow;
}

/** Everything that has to be true before any money goes out, whichever way it's sent. */
async function loadPayablePayment(admin: Admin, paymentEventId: string): Promise<{ payment: PayablePayment } | { message: string }> {
  const { data: payment, error: paymentLookupError } = await admin
    .from("payment_events")
    .select("id, contract_id, net_amount, currency, status, escrow_status, dispute_window_ends_at, disbursement_status, payout_attempts, payout_last_attempt_at")
    .eq("id", paymentEventId)
    .maybeSingle();
  if (paymentLookupError) return { message: `Could not load the payment: ${paymentLookupError.message}` };
  if (!payment) return { message: "Payment not found." };
  if (payment.status && payment.status !== "succeeded") return { message: "This payment hasn't been received, so there's nothing to pay out." };
  if (payment.disbursement_status === "succeeded" || payment.escrow_status === "released") {
    return { message: "This payout has already been sent." };
  }
  if (payment.escrow_status !== "held" && payment.escrow_status !== "not_applicable") {
    return { message: "This payment isn't waiting for a payout." };
  }

  const { data: contract } = await admin.from("contracts").select("talent_id").eq("id", payment.contract_id).maybeSingle();
  if (!contract) return { message: "Contract not found." };

  // limit(1), not maybeSingle(): maybeSingle() errors (data: null) when a
  // contract has MORE than one unresolved dispute, which would read as
  // "no dispute" and let the payout through. Errors also block payout —
  // never pay out on a dispute check we couldn't complete.
  const { data: openDisputes, error: disputeError } = await admin
    .from("disputes")
    .select("id")
    .eq("contract_id", payment.contract_id)
    .neq("status", "resolved")
    .limit(1);
  if (disputeError) return { message: `Could not check for open disputes: ${disputeError.message}` };
  if (openDisputes && openDisputes.length > 0) return { message: "This contract has an open dispute — resolve it before paying out." };

  if (payment.escrow_status === "held" && payment.dispute_window_ends_at && new Date(payment.dispute_window_ends_at) > new Date()) {
    return { message: "The dispute window for this payment hasn't passed yet." };
  }

  const { data: method } = await admin
    .from("talent_payout_methods")
    .select("method, phone, bank_name, account_name, account_number, name_checked_at")
    .eq("talent_id", contract.talent_id)
    .maybeSingle();
  if (!method) {
    return { message: "This talent hasn't chosen how to be paid yet. Ask them to add a payout method under Finance, then try again." };
  }

  // 0125: before a talent's first payout to this wallet or account, finance
  // checks the name it's registered to (it resets when the details change).
  if (!method.name_checked_at) {
    return { message: "Check the name on this talent's wallet or bank account first (Payouts → Name check), then pay out." };
  }

  return {
    payment: {
      id: payment.id,
      contract_id: payment.contract_id,
      net_amount: payment.net_amount,
      currency: payment.currency,
      escrow_status: payment.escrow_status,
      payout_attempts: payment.payout_attempts ?? 0,
      disbursement_status: payment.disbursement_status,
      payout_last_attempt_at: payment.payout_last_attempt_at ?? null,
      talentId: contract.talent_id,
      method: method as PayoutMethodRow,
    },
  };
}

/** Marks the payout sent and tells the talent. Shared by the automatic and the manual route. */
async function completePayout(
  admin: Admin,
  payment: PayablePayment,
  actorId: string,
  reference: string,
  extra: { payout_recorded_by?: string } = {}
): Promise<FormState & { released?: boolean }> {
  const receiptNumber = await nextReceiptNumber(admin, payment.id);
  const destination = describePayoutMethod(payment.method);
  const { error: releaseError } = await admin
    .from("payment_events")
    .update({
      // A payment that was never held keeps 'not_applicable'.
      escrow_status: payment.escrow_status === "held" ? "released" : payment.escrow_status,
      disbursement_status: "succeeded",
      disbursement_reference: reference,
      disbursement_failure_reason: null,
      disbursed_at: new Date().toISOString(),
      payout_receipt_number: receiptNumber,
      ...extra,
    })
    .eq("id", payment.id);
  if (releaseError) {
    return { message: `The payout went out (ref ${reference}) but recording it failed: ${releaseError.message}. Needs manual reconciliation — don't send it again.` };
  }

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.PAYMENT_STATUS_CHANGED,
    actorId,
    entityType: "payment_events",
    entityId: payment.id,
    source: "platform",
    before: { escrowStatus: payment.escrow_status, disbursementStatus: "pending" },
    after: { disbursementStatus: "succeeded", disbursementReference: reference, payoutReceiptNumber: receiptNumber, payoutMethod: payment.method.method },
    metadata: { contractId: payment.contract_id, netAmount: payment.net_amount, currency: payment.currency, destination, manual: Boolean(extra.payout_recorded_by) },
  });

  const title = "Your payout has been sent";
  const body = `${payment.currency} ${payment.net_amount.toLocaleString()} has been sent to ${destination}. Reference ${reference}, receipt ${receiptNumber}.`;
  await notifyUser(admin, {
    userId: payment.talentId,
    type: NOTIFICATION_TYPES.ESCROW_RELEASED,
    title,
    body,
    link: `/contracts/${payment.contract_id}`,
    dedupeKey: payment.id,
  });
  const talentEmail = await getUserEmail(admin, payment.talentId);
  await sendEmailSafely(
    talentEmail,
    `${title} — AdorWorks`,
    renderEmail({
      heading: title,
      paragraphs: [body],
      ctaLabel: "View contract",
      ctaUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/contracts/${payment.contract_id}`,
      unsubscribeUrl: buildUnsubscribeUrl(payment.talentId),
    }),
    { admin, recipientUserId: payment.talentId }
  );

  revalidatePath("/operations/payouts");
  return { released: true };
}

/**
 * Atomic claim before any money moves. The checks above are only reads —
 * two staff (or two tabs) can both pass them. This update only matches a
 * row that isn't already mid-payout or paid, so exactly one request goes
 * on; the other stops. A row stuck in 'pending' (crash mid-payout) is
 * never retried automatically: whether the money left is unknown, so a
 * person checks the statement first and then uses resetStuckPayout().
 */
async function claimPayout(admin: Admin, payment: PayablePayment, opts: { allowStuck?: boolean } = {}) {
  return admin
    .from("payment_events")
    .update({
      disbursement_status: "pending",
      disbursement_failure_reason: null,
      payout_method: payment.method.method,
      payout_destination: describePayoutMethod(payment.method),
      payout_attempts: payment.payout_attempts + 1,
      payout_last_attempt_at: new Date().toISOString(),
    })
    .eq("id", payment.id)
    // Every claim bumps the attempt count, so matching the count we read
    // means nobody else has claimed this payout since.
    .eq("payout_attempts", payment.payout_attempts)
    .in("escrow_status", ["held", "not_applicable"])
    .or(`disbursement_status.is.null,disbursement_status.eq.failed${opts.allowStuck ? ",disbursement_status.eq.pending" : ""}`)
    .select("id");
}

/** A send that hasn't finished within 2 minutes has stopped; a real MTN call takes seconds. */
function isStuck(lastAttemptAt: string | null): boolean {
  return !lastAttemptAt || Date.now() - Date.parse(lastAttemptAt) > 2 * 60 * 1000;
}

const ALREADY_CLAIMED =
  "This payout is already being processed or was sent. Refresh the page — if it stays stuck, check the statement before resetting it.";

/** Sends the talent's payout automatically. Only MTN Mobile Money is connected; other methods are recorded by hand. */
export async function sendPayout(paymentEventId: string): Promise<FormState & { released?: boolean }> {
  const session = await requireRole(...FINANCE_ROLES);
  const admin = createAdminClient();

  const loaded = await loadPayablePayment(admin, paymentEventId);
  if ("message" in loaded) return { message: loaded.message };
  const { payment } = loaded;
  if (payment.method.method !== "mtn_momo") {
    return { message: `This talent is paid by ${describePayoutMethod(payment.method)}. Send it yourself, then record the payout with its reference.` };
  }
  if (!payment.method.phone) return { message: "This talent's MTN number is missing. Ask them to update their payout method under Finance." };

  const { data: claimed, error: claimError } = await claimPayout(admin, payment);
  if (claimError) return { message: `Could not start the payout: ${claimError.message}` };
  if (!claimed || claimed.length === 0) return { message: ALREADY_CLAIMED };

  const provider = await getActivePayoutProvider("mtn_momo");
  const result = provider
    ? await provider.payout({ phone: payment.method.phone, amount: payment.net_amount, currency: payment.currency })
    : { success: false as const, reason: "Unknown payout provider." };

  if (!result.success) {
    await admin
      .from("payment_events")
      .update({ disbursement_status: "failed", disbursement_failure_reason: result.reason })
      .eq("id", paymentEventId);
    await logAuditEvent(admin, {
      name: DOMAIN_EVENTS.PAYMENT_STATUS_CHANGED,
      actorId: session.userId,
      entityType: "payment_events",
      entityId: paymentEventId,
      source: "platform",
      after: { disbursementStatus: "failed", reason: result.reason, attempt: payment.payout_attempts + 1 },
      metadata: { contractId: payment.contract_id, payoutMethod: "mtn_momo" },
    });
    // Tell the talent too: a wrong or inactive number is the usual cause,
    // and only they can fix it.
    await notifyUser(admin, {
      userId: payment.talentId,
      type: NOTIFICATION_TYPES.PAYOUT_FAILED,
      title: "We couldn't send your payout",
      body: `Sending ${payment.currency} ${payment.net_amount.toLocaleString()} to ${describePayoutMethod(payment.method)} didn't go through. Check your payout method under Finance — AdorWorks will try again.`,
      link: "/finance",
      dedupeKey: `${paymentEventId}:${payment.payout_attempts + 1}`,
    });
    revalidatePath("/operations/payouts");
    return { message: `Payout failed: ${result.reason}` };
  }

  return completePayout(admin, payment, session.userId, result.reference);
}

/** Kept for existing callers: the old name for sendPayout(). */
export async function releaseEscrowedPayment(paymentEventId: string): Promise<FormState & { released?: boolean }> {
  return sendPayout(paymentEventId);
}

const ManualPayoutSchema = z.object({
  reference: z.string().trim().min(4, "Enter the transaction reference from the mGurush or bank statement.").max(120),
});

/**
 * Finance staff paid the talent themselves (mGurush, or a bank transfer
 * to the talent's bank) and record it here with the reference from the
 * statement. Also usable for MTN when the automatic route is down and
 * staff sent it by hand.
 */
export async function recordManualPayout(paymentEventId: string, _prev: FormState, formData: FormData): Promise<FormState & { released?: boolean }> {
  const session = await requireRole(...FINANCE_ROLES);
  const parsed = ManualPayoutSchema.safeParse({ reference: formData.get("reference") ?? "" });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const admin = createAdminClient();

  const loaded = await loadPayablePayment(admin, paymentEventId);
  if ("message" in loaded) return { message: loaded.message };
  const { payment } = loaded;

  // A payout stuck mid-send can be recorded here too, once staff have
  // found it on the statement — but not one that's being sent right now.
  if (payment.disbursement_status === "pending" && !isStuck(payment.payout_last_attempt_at)) {
    return { message: "This payout is being sent right now. Wait a few minutes, then refresh." };
  }
  const { data: claimed, error: claimError } = await claimPayout(admin, payment, { allowStuck: true });
  if (claimError) return { message: `Could not record the payout: ${claimError.message}` };
  if (!claimed || claimed.length === 0) return { message: ALREADY_CLAIMED };

  return completePayout(admin, payment, session.userId, parsed.data.reference, { payout_recorded_by: session.userId });
}

const ResetSchema = z.object({
  note: z.string().trim().min(10, "Say what you checked (at least 10 characters) — it goes in the audit log."),
});

/**
 * A payout stuck at 'pending' (the app stopped mid-payout) is never
 * retried automatically, because nobody knows whether the money left.
 * After checking the MTN statement and confirming it did NOT go out,
 * finance resets it to 'failed' so it can be sent again. (If it did go
 * out, record it with recordManualPayout() instead.)
 */
export async function resetStuckPayout(paymentEventId: string, _prev: FormState, formData: FormData): Promise<FormState & { reset?: boolean }> {
  const session = await requireRole(...FINANCE_ROLES);
  const parsed = ResetSchema.safeParse({ note: formData.get("note") ?? "" });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const admin = createAdminClient();

  const { data: current } = await admin.from("payment_events").select("payout_last_attempt_at").eq("id", paymentEventId).maybeSingle();
  if (current && !isStuck(current.payout_last_attempt_at)) {
    return { message: "This payout started less than 2 minutes ago and may still be sending. Wait, then refresh." };
  }

  const { data: reset, error } = await admin
    .from("payment_events")
    .update({ disbursement_status: "failed", disbursement_failure_reason: `Reset by staff: ${parsed.data.note}` })
    .eq("id", paymentEventId)
    .eq("disbursement_status", "pending")
    .select("id");
  if (error) return { message: `Could not reset the payout: ${error.message}` };
  if (!reset || reset.length === 0) return { message: "This payout isn't stuck any more. Refresh the page." };

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.PAYMENT_STATUS_CHANGED,
    actorId: session.userId,
    entityType: "payment_events",
    entityId: paymentEventId,
    source: "platform",
    reason: parsed.data.note,
    before: { disbursementStatus: "pending" },
    after: { disbursementStatus: "failed" },
  });
  revalidatePath("/operations/payouts");
  return { reset: true };
}
