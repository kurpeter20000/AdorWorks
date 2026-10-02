"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole, STAFF_ROLES } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateFees } from "@/lib/domain/fees";
import { disputeWindowEndsAt } from "@/lib/domain/escrow";
import { getEscrowSettings, getFeeSettings } from "@/lib/dal/settings";
import { isInstitutional } from "@/lib/domain/institutional";
import { notifyUser, NOTIFICATION_TYPES } from "@/lib/domain/notifications";
import { sendEmailSafely, getUserEmail } from "@/lib/email";
import { renderEmail } from "@/lib/emailTemplate";
import { buildUnsubscribeUrl } from "@/lib/unsubscribeToken";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";
import type { FormState } from "./auth";

const ConfirmSchema = z.object({
  bankReference: z.string().trim().min(3, "Enter the bank transaction reference."),
});

/**
 * Finance/admin confirms an institutional invoice's bank transfer has
 * cleared (Stage 16 step 5) — the institutional counterpart to
 * payMilestone() in contracts.ts, for orgs that pay by invoice instead
 * of mobile money (see lib/domain/institutional.ts). Deliberately a
 * separate function rather than a branch inside payMilestone(): that
 * function is already proven correct and live-verified against real
 * payment flows (Stage 16 step 4); duplicating its settlement tail here
 * is a smaller, more auditable risk than threading a second code path
 * through it.
 *
 * Staff-confirmed rather than self-serve ("mark my own invoice paid")
 * on purpose — a payer confirming their own payment is an obvious fraud
 * vector. is_simulated is always false here: unlike the mobile-money
 * mock, there's no simulated version of a human checking a bank
 * statement — this action only exists to be called once a real transfer
 * has actually cleared.
 */
export async function confirmInstitutionalPayment(
  invoiceId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState & { confirmed?: boolean }> {
  const session = await requireRole(...STAFF_ROLES);
  const admin = createAdminClient();

  const validated = ConfirmSchema.safeParse({ bankReference: formData.get("bankReference") });
  if (!validated.success) return { errors: validated.error.flatten().fieldErrors };

  const { data: invoice } = await admin
    .from("finance_records")
    .select("id, contract_id, milestone_id, amount, currency, status, record_type")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice || invoice.record_type !== "invoice") return { message: "Invoice not found." };
  if (invoice.status !== "pending") return { message: "This invoice isn't awaiting payment." };
  if (!invoice.contract_id || !invoice.milestone_id) return { message: "This invoice isn't tied to a contract milestone." };

  const { data: contract } = await admin.from("contracts").select("talent_id, organisation_id").eq("id", invoice.contract_id).maybeSingle();
  if (!contract) return { message: "Contract not found." };
  const { data: org } = await admin.from("organisations").select("org_type").eq("id", contract.organisation_id).maybeSingle();
  if (!isInstitutional(org?.org_type)) return { message: "This organisation isn't on institutional (invoice) billing." };

  const { data: existingPayment } = await admin
    .from("payment_events")
    .select("id")
    .eq("milestone_id", invoice.milestone_id)
    .eq("status", "succeeded")
    .maybeSingle();
  if (existingPayment) return { message: "This milestone has already been paid." };

  const fee = calculateFees(invoice.amount, await getFeeSettings());
  const escrow = await getEscrowSettings();
  const escrowEndsAt = escrow.enabled ? disputeWindowEndsAt(escrow) : null;
  const receiptNumber = `RCPT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${invoiceId.slice(0, 8).toUpperCase()}`;

  const { error: paymentError } = await admin.from("payment_events").insert({
    milestone_id: invoice.milestone_id,
    contract_id: invoice.contract_id,
    invoice_id: invoice.id,
    provider_name: "bank_transfer",
    external_reference: validated.data.bankReference,
    receipt_number: receiptNumber,
    amount: invoice.amount,
    currency: invoice.currency,
    fee_percent: fee.talentFeePercent,
    fee_amount: fee.talentFeeAmount,
    net_amount: fee.netAmount,
    employer_fee_percent: fee.employerFeePercent,
    employer_fee_amount: fee.employerFeeAmount,
    total_charged: fee.totalCharged,
    is_simulated: false,
    escrow_status: escrow.enabled ? "held" : "not_applicable",
    dispute_window_ends_at: escrowEndsAt ? escrowEndsAt.toISOString() : null,
  });
  if (paymentError) return { message: `Could not record the payment: ${paymentError.message}` };

  await admin
    .from("finance_records")
    .update({ status: "confirmed", bank_reference: validated.data.bankReference, confirmed_by: session.userId, confirmed_at: new Date().toISOString() })
    .eq("id", invoiceId);
  await admin.from("milestones").update({ status: "paid" }).eq("id", invoice.milestone_id);

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.PAYMENT_STATUS_CHANGED,
    actorId: session.userId,
    entityType: "payment_events",
    entityId: invoiceId,
    source: "platform",
    after: { status: "succeeded", provider: "bank_transfer", receiptNumber, amount: invoice.amount, currency: invoice.currency },
    metadata: { contractId: invoice.contract_id, milestoneId: invoice.milestone_id, bankReference: validated.data.bankReference },
  });

  const amountSummary = `${invoice.currency} ${fee.netAmount.toLocaleString()} net (${invoice.currency} ${invoice.amount.toLocaleString()} agreed${fee.talentFeeAmount > 0 ? `, ${invoice.currency} ${fee.talentFeeAmount.toLocaleString()} AdorWorks fee` : ""})`;
  const title = escrow.enabled ? "Payment received — held briefly before release" : "You were paid";
  const body = escrow.enabled
    ? `${amountSummary} received by bank transfer and held until ${escrowEndsAt!.toLocaleDateString()} (AdorWorks' dispute window), then released to you automatically unless a dispute is raised. Receipt ${receiptNumber}.`
    : `${amountSummary}. Receipt ${receiptNumber}.`;
  await notifyUser(admin, {
    userId: contract.talent_id,
    type: NOTIFICATION_TYPES.MILESTONE_PAID,
    title,
    body,
    link: `/contracts/${invoice.contract_id}`,
    dedupeKey: invoice.milestone_id,
  });
  const talentEmail = await getUserEmail(admin, contract.talent_id);
  await sendEmailSafely(
    talentEmail,
    `${title} — AdorWorks`,
    renderEmail({
      heading: title,
      paragraphs: [body],
      ctaLabel: "View contract",
      ctaUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/contracts/${invoice.contract_id}`,
      unsubscribeUrl: buildUnsubscribeUrl(contract.talent_id),
    }),
    { admin, recipientUserId: contract.talent_id }
  );

  revalidatePath("/operations/invoices");
  revalidatePath(`/contracts/${invoice.contract_id}`);
  return { confirmed: true };
}
