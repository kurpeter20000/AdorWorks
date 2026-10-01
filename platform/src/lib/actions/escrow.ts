"use server";

import { revalidatePath } from "next/cache";
import { requireRole, STAFF_ROLES } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActivePayoutProvider } from "@/lib/payoutProviders.server";
import { notifyUser, NOTIFICATION_TYPES } from "@/lib/domain/notifications";
import { sendEmailSafely, getUserEmail } from "@/lib/email";
import { renderEmail } from "@/lib/emailTemplate";
import { buildUnsubscribeUrl } from "@/lib/unsubscribeToken";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";
import type { FormState } from "./auth";

/**
 * Staff releases a held escrow payment (Stage 16 step 4) — disburses the
 * talent's already-computed net_amount via MTN MoMo Disbursements (or the
 * simulated provider while ADORWORKS_FF_REAL_PAYMENTS is off) and marks
 * the payment_events row released.
 *
 * Staff-triggered rather than fully automatic: there's no scheduled job
 * wired to call this yet (disbursement needs an outbound HTTP call,
 * which plain SQL/pg_cron can't make — see migration 0099's comment).
 * /operations/payouts lists exactly the rows escrow_release_eligible()
 * says are due (dispute window passed, no open dispute), so this is a
 * one-click action on an already-filtered, already-eligible queue, not
 * an unreviewed bulk release.
 */
export async function releaseEscrowedPayment(paymentEventId: string): Promise<FormState & { released?: boolean }> {
  const session = await requireRole(...STAFF_ROLES);
  const admin = createAdminClient();

  const { data: payment } = await admin
    .from("payment_events")
    .select("id, contract_id, net_amount, currency, escrow_status, dispute_window_ends_at")
    .eq("id", paymentEventId)
    .maybeSingle();
  if (!payment) return { message: "Payment not found." };
  if (payment.escrow_status !== "held") return { message: "This payment isn't currently held in escrow." };

  const { data: contract } = await admin.from("contracts").select("talent_id").eq("id", payment.contract_id).maybeSingle();
  if (!contract) return { message: "Contract not found." };

  const { data: openDispute } = await admin
    .from("disputes")
    .select("id")
    .eq("contract_id", payment.contract_id)
    .neq("status", "resolved")
    .maybeSingle();
  if (openDispute) return { message: "This contract has an open dispute — resolve it before releasing the payout." };

  if (payment.dispute_window_ends_at && new Date(payment.dispute_window_ends_at) > new Date()) {
    return { message: "The dispute window for this payment hasn't passed yet." };
  }

  const { data: talentProfile } = await admin.from("profiles").select("phone").eq("id", contract.talent_id).maybeSingle();
  if (!talentProfile?.phone) {
    return { message: "This talent has no phone number on file — can't disburse by mobile money." };
  }

  await admin.from("payment_events").update({ disbursement_status: "pending" }).eq("id", paymentEventId);

  const provider = await getActivePayoutProvider("mtn_momo");
  const result = provider
    ? await provider.payout({ phone: talentProfile.phone, amount: payment.net_amount, currency: payment.currency })
    : { success: false as const, reason: "Unknown payout provider." };

  if (!result.success) {
    await admin
      .from("payment_events")
      .update({ disbursement_status: "failed", disbursement_failure_reason: result.reason })
      .eq("id", paymentEventId);
    return { message: `Payout failed: ${result.reason}` };
  }

  const { error: releaseError } = await admin
    .from("payment_events")
    .update({
      escrow_status: "released",
      disbursement_status: "succeeded",
      disbursement_reference: result.reference,
      disbursed_at: new Date().toISOString(),
    })
    .eq("id", paymentEventId);
  if (releaseError) return { message: `Payout succeeded (ref ${result.reference}) but recording it failed: ${releaseError.message}. Needs manual reconciliation.` };

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.PAYMENT_STATUS_CHANGED,
    actorId: session.userId,
    entityType: "payment_events",
    entityId: paymentEventId,
    source: "platform",
    before: { escrowStatus: "held" },
    after: { escrowStatus: "released", disbursementReference: result.reference },
    metadata: { contractId: payment.contract_id, netAmount: payment.net_amount, currency: payment.currency },
  });

  const releasedBody = `${payment.currency} ${payment.net_amount.toLocaleString()} has been sent to your mobile money account.`;
  await notifyUser(admin, {
    userId: contract.talent_id,
    type: NOTIFICATION_TYPES.ESCROW_RELEASED,
    title: "Your payout has been released",
    body: releasedBody,
    link: `/contracts/${payment.contract_id}`,
    dedupeKey: paymentEventId,
  });
  const talentEmail = await getUserEmail(admin, contract.talent_id);
  await sendEmailSafely(
    talentEmail,
    "Your payout has been released — AdorWorks",
    renderEmail({
      heading: "Your payout has been released",
      paragraphs: [releasedBody],
      ctaLabel: "View contract",
      ctaUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/contracts/${payment.contract_id}`,
      unsubscribeUrl: buildUnsubscribeUrl(contract.talent_id),
    }),
    { admin, recipientUserId: contract.talent_id }
  );

  revalidatePath("/operations/payouts");
  return { released: true };
}
