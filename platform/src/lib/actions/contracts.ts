"use server";

import { z } from "zod";
import { requireSession, requireRole } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPaymentProvider } from "@/lib/paymentProviders";
import type { FormState } from "./auth";

/**
 * Called right after the talent's browser has already uploaded the
 * deliverable file and inserted its row directly (RLS allows that self-
 * service insert — see onboarding/verification/verification-form.tsx
 * for the same client-upload-then-record pattern). This action only
 * does the part RLS doesn't allow a plain user session to do: flip the
 * milestone forward to 'submitted' (milestones_write is staff-only).
 */
export async function recordDeliverableSubmission(milestoneId: string): Promise<{ error?: string }> {
  const session = await requireRole("talent");
  const admin = createAdminClient();

  const { data: milestone } = await admin
    .from("milestones")
    .select("id, status, contract_id")
    .eq("id", milestoneId)
    .maybeSingle();
  if (!milestone) return { error: "Milestone not found." };

  const { data: contract } = await admin
    .from("contracts")
    .select("talent_id")
    .eq("id", milestone.contract_id)
    .maybeSingle();
  if (!contract || contract.talent_id !== session.userId) {
    return { error: "You don't have permission to update this milestone." };
  }

  const { data: latestDeliverable } = await admin
    .from("deliverables")
    .select("id, submitted_by")
    .eq("milestone_id", milestoneId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latestDeliverable || latestDeliverable.submitted_by !== session.userId) {
    return { error: "Upload a file before marking this milestone submitted." };
  }

  const { error } = await admin.from("milestones").update({ status: "submitted" }).eq("id", milestoneId);
  if (error) return { error: error.message };
  return {};
}

async function requireEmployerForMilestone(milestoneId: string, userId: string) {
  const admin = createAdminClient();
  const { data: milestone } = await admin
    .from("milestones")
    .select("id, status, contract_id")
    .eq("id", milestoneId)
    .maybeSingle();
  if (!milestone) return { error: "Milestone not found." as const, admin, milestone: null, contract: null };

  const { data: contract } = await admin
    .from("contracts")
    .select("id, organisation_id, talent_id")
    .eq("id", milestone.contract_id)
    .maybeSingle();
  if (!contract) return { error: "Contract not found." as const, admin, milestone, contract: null };

  const { data: org } = await admin
    .from("organisations")
    .select("representative_id")
    .eq("id", contract.organisation_id)
    .maybeSingle();
  if (!org || org.representative_id !== userId) {
    return { error: "You don't have permission to manage this contract." as const, admin, milestone, contract };
  }

  return { error: null, admin, milestone, contract };
}

/** Completes the contract + writes the durable work_history/Passport record once every milestone is settled. */
async function maybeCompleteContract(admin: ReturnType<typeof createAdminClient>, contractId: string) {
  const { data: milestones } = await admin.from("milestones").select("status").eq("contract_id", contractId);
  const allSettled = (milestones ?? []).length > 0 && (milestones ?? []).every((m) => m.status === "approved" || m.status === "paid");
  if (!allSettled) return;

  const { data: contract } = await admin
    .from("contracts")
    .select("id, talent_id, organisation_id, status, opportunity_id")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract || contract.status === "completed") return;

  await admin
    .from("contracts")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", contractId);

  const { data: opportunity } = await admin
    .from("opportunities")
    .select("title, brief")
    .eq("id", contract.opportunity_id)
    .maybeSingle();

  await admin.from("work_history").insert({
    talent_id: contract.talent_id,
    contract_id: contract.id,
    organisation_id: contract.organisation_id,
    title: opportunity?.title ?? "AdorWorks engagement",
    summary: opportunity?.brief ?? null,
    completed_at: new Date().toISOString(),
  });
}

/** Employer approves a submitted deliverable — moves the deliverable and its milestone forward, and completes the contract if that was the last open milestone. */
export async function approveDeliverable(deliverableId: string): Promise<{ error?: string }> {
  const session = await requireRole("individual_client");
  const admin = createAdminClient();

  const { data: deliverable } = await admin
    .from("deliverables")
    .select("id, milestone_id, status")
    .eq("id", deliverableId)
    .maybeSingle();
  if (!deliverable) return { error: "Deliverable not found." };

  const check = await requireEmployerForMilestone(deliverable.milestone_id, session.userId);
  if (check.error) return { error: check.error };
  if (check.milestone!.status !== "submitted") {
    return { error: "This deliverable isn't awaiting review." };
  }

  await admin.from("deliverables").update({ status: "approved" }).eq("id", deliverableId);
  await admin.from("milestones").update({ status: "approved" }).eq("id", deliverable.milestone_id);

  // An approved milestone is money now owed — raise the invoice for it.
  // "Invoice" here means the same thing finance_records has always meant
  // (see finance.js): a manually-tracked record of what's owed, not a
  // document sent through a billing system.
  const { data: milestoneForInvoice } = await admin
    .from("milestones")
    .select("amount, currency")
    .eq("id", deliverable.milestone_id)
    .maybeSingle();
  if (milestoneForInvoice) {
    await admin.from("finance_records").insert({
      contract_id: check.contract!.id,
      milestone_id: deliverable.milestone_id,
      record_type: "invoice",
      amount: milestoneForInvoice.amount,
      currency: milestoneForInvoice.currency,
      status: "pending",
      recorded_by: session.userId,
    });
  }

  await maybeCompleteContract(admin, check.contract!.id);

  return {};
}

/** Employer sends a submitted deliverable back for changes. */
export async function requestRevision(deliverableId: string, note: string): Promise<{ error?: string }> {
  const session = await requireRole("individual_client");
  const admin = createAdminClient();

  const { data: deliverable } = await admin
    .from("deliverables")
    .select("id, milestone_id, status")
    .eq("id", deliverableId)
    .maybeSingle();
  if (!deliverable) return { error: "Deliverable not found." };

  const check = await requireEmployerForMilestone(deliverable.milestone_id, session.userId);
  if (check.error) return { error: check.error };
  if (check.milestone!.status !== "submitted") {
    return { error: "This deliverable isn't awaiting review." };
  }

  await admin.from("deliverables").update({ status: "revision_requested" }).eq("id", deliverableId);
  await admin.from("milestones").update({ status: "revision_requested" }).eq("id", deliverable.milestone_id);

  if (note.trim()) {
    await postSystemMessage(admin, check.contract!.id, session.userId, `Revision requested: ${note.trim()}`);
  }

  return {};
}

const CheckoutSchema = z
  .object({
    provider: z.enum(["mgurush", "mtn_momo", "visa_mastercard"], { message: "Choose a payment provider." }),
    phone: z.string().trim().optional(),
    cardNumber: z.string().trim().optional(),
    cardExpiry: z.string().trim().optional(),
    cardCvv: z.string().trim().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.provider === "visa_mastercard") {
      if (!v.cardNumber) ctx.addIssue({ code: "custom", path: ["cardNumber"], message: "Enter the card number." });
      if (!v.cardExpiry) ctx.addIssue({ code: "custom", path: ["cardExpiry"], message: "Enter the expiry date." });
      if (!v.cardCvv) ctx.addIssue({ code: "custom", path: ["cardCvv"], message: "Enter the CVV." });
    } else if (!v.phone || v.phone.length < 9) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: "Enter a valid phone number." });
    }
  });

/**
 * Simulated mobile-money / card checkout. is_simulated on the resulting
 * payment_events row stays true — no code path anywhere in this project
 * ever sets it false, because no real payment provider is integrated
 * (see paymentProviders.ts). This records a payment_intentions row
 * first (the pre-settlement "details submitted, waiting on the
 * provider" state a real gateway would have), then "charges" through
 * the swappable PaymentProvider interface, then writes the settled
 * payment_events row + a receipt number, confirms the invoice, and
 * marks the milestone paid.
 */
export async function payMilestone(milestoneId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireRole("individual_client");
  const check = await requireEmployerForMilestone(milestoneId, session.userId);
  if (check.error) return { message: check.error };
  if (check.milestone!.status !== "approved") {
    return { message: "Only an approved milestone can be paid." };
  }
  const admin = check.admin;

  const validated = CheckoutSchema.safeParse({
    provider: formData.get("provider"),
    phone: formData.get("phone") || undefined,
    cardNumber: formData.get("cardNumber") || undefined,
    cardExpiry: formData.get("cardExpiry") || undefined,
    cardCvv: formData.get("cardCvv") || undefined,
  });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }
  const v = validated.data;

  const { data: milestone } = await admin
    .from("milestones")
    .select("amount, currency")
    .eq("id", milestoneId)
    .maybeSingle();
  if (!milestone) return { message: "Milestone not found." };

  const { data: invoice } = await admin
    .from("finance_records")
    .select("id")
    .eq("milestone_id", milestoneId)
    .eq("record_type", "invoice")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: intention, error: intentionError } = await admin
    .from("payment_intentions")
    .insert({
      contract_id: check.contract!.id,
      milestone_id: milestoneId,
      invoice_id: invoice?.id ?? null,
      provider: v.provider,
      payer_phone: v.phone || null,
      amount: milestone.amount,
      currency: milestone.currency,
      created_by: session.userId,
    })
    .select("id")
    .single();
  if (intentionError || !intention) return { message: intentionError?.message ?? "Could not start the payment." };

  const provider = getPaymentProvider(v.provider);
  const result = provider
    ? await provider.charge({
        phone: v.phone ?? "",
        amount: milestone.amount,
        currency: milestone.currency,
        card: v.provider === "visa_mastercard" ? { number: v.cardNumber!, expiry: v.cardExpiry!, cvv: v.cardCvv! } : undefined,
      })
    : { success: false as const, reason: "Unknown payment provider." };

  if (!result.success) {
    await admin
      .from("payment_intentions")
      .update({ status: "failed", failure_reason: result.reason, resolved_at: new Date().toISOString() })
      .eq("id", intention.id);
    return { message: result.reason };
  }

  if (result.cardLast4) {
    await admin
      .from("payment_intentions")
      .update({ card_last4: result.cardLast4, card_brand: result.cardBrand })
      .eq("id", intention.id);
  }

  const receiptNumber = `RCPT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${intention.id.slice(0, 8).toUpperCase()}`;

  const { error: paymentError } = await admin.from("payment_events").insert({
    milestone_id: milestoneId,
    contract_id: check.contract!.id,
    intention_id: intention.id,
    invoice_id: invoice?.id ?? null,
    provider_name: v.provider,
    external_reference: result.reference,
    payer_phone: v.phone || null,
    card_last4: result.cardLast4 ?? null,
    card_brand: result.cardBrand ?? null,
    receipt_number: receiptNumber,
    amount: milestone.amount,
    currency: milestone.currency,
  });
  if (paymentError) return { message: paymentError.message };

  await admin
    .from("payment_intentions")
    .update({ status: "succeeded", resolved_at: new Date().toISOString() })
    .eq("id", intention.id);
  if (invoice) await admin.from("finance_records").update({ status: "confirmed" }).eq("id", invoice.id);
  await admin.from("milestones").update({ status: "paid" }).eq("id", milestoneId);

  return {};
}

async function postSystemMessage(
  admin: ReturnType<typeof createAdminClient>,
  contractId: string,
  senderId: string,
  body: string,
  attachment?: { filePath: string; fileName: string }
) {
  let { data: conversation } = await admin
    .from("conversations")
    .select("id")
    .eq("contract_id", contractId)
    .maybeSingle();
  if (!conversation) {
    const { data: created } = await admin.from("conversations").insert({ contract_id: contractId }).select("id").single();
    conversation = created ?? null;
    if (conversation) {
      const { data: contract } = await admin
        .from("contracts")
        .select("talent_id, organisation_id")
        .eq("id", contractId)
        .maybeSingle();
      const { data: org } = contract
        ? await admin.from("organisations").select("representative_id").eq("id", contract.organisation_id).maybeSingle()
        : { data: null };
      const memberIds = [contract?.talent_id, org?.representative_id].filter(Boolean) as string[];
      if (memberIds.length > 0) {
        await admin
          .from("conversation_members")
          .insert(memberIds.map((user_id) => ({ conversation_id: conversation!.id, user_id })));
      }
    }
  }
  if (!conversation) return;
  await admin.from("messages").insert({
    conversation_id: conversation.id,
    sender_id: senderId,
    body,
    file_path: attachment?.filePath ?? null,
    file_name: attachment?.fileName ?? null,
  });
}

const MessageSchema = z.object({
  body: z.string().trim().max(4000),
  filePath: z.string().trim().optional(),
  fileName: z.string().trim().optional(),
});

/**
 * Either contract participant sending a message — creates the
 * conversation/membership on first use. If an attachment is included, the
 * browser has already uploaded it directly to the 'message-attachments'
 * bucket (RLS allows a contract participant's own upload — see
 * message-thread.tsx) before this action is called; this just records the
 * path. A message needs either text or an attachment, not necessarily both.
 */
export async function sendMessage(contractId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const admin = createAdminClient();

  const validated = MessageSchema.safeParse({
    body: formData.get("body") || "",
    filePath: formData.get("filePath") || undefined,
    fileName: formData.get("fileName") || undefined,
  });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }
  if (!validated.data.body && !validated.data.filePath) {
    return { message: "Write a message or attach a file." };
  }

  const { data: contract } = await admin
    .from("contracts")
    .select("talent_id, organisation_id")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract) return { message: "Contract not found." };

  const { data: org } = await admin
    .from("organisations")
    .select("representative_id")
    .eq("id", contract.organisation_id)
    .maybeSingle();

  const isParticipant = session.userId === contract.talent_id || session.userId === org?.representative_id;
  if (!isParticipant) return { message: "You aren't part of this contract." };

  await postSystemMessage(
    admin,
    contractId,
    session.userId,
    validated.data.body || (validated.data.fileName ? `Sent a file: ${validated.data.fileName}` : ""),
    validated.data.filePath && validated.data.fileName
      ? { filePath: validated.data.filePath, fileName: validated.data.fileName }
      : undefined
  );
  return {};
}

const DisputeSchema = z.object({
  description: z.string().trim().min(20, "Describe the issue in at least 20 characters."),
});

/**
 * Either contract participant raising a dispute. Unlike messages, this has
 * to touch contracts.status too (RLS deliberately blocks a direct client
 * UPDATE on contracts — see contracts_update's policy comment — so this
 * goes through the admin client like every other contract state change).
 */
export async function raiseDispute(contractId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const admin = createAdminClient();

  const validated = DisputeSchema.safeParse({ description: formData.get("description") });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { data: contract } = await admin
    .from("contracts")
    .select("talent_id, organisation_id, status")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract) return { message: "Contract not found." };

  const { data: org } = await admin
    .from("organisations")
    .select("representative_id")
    .eq("id", contract.organisation_id)
    .maybeSingle();

  const isParticipant = session.userId === contract.talent_id || session.userId === org?.representative_id;
  if (!isParticipant) return { message: "You aren't part of this contract." };
  if (contract.status === "disputed") return { message: "This contract already has an open dispute." };
  if (contract.status !== "active") return { message: "Only an active contract can be disputed." };

  const { error } = await admin.from("disputes").insert({
    contract_id: contractId,
    raised_by: session.userId,
    description: validated.data.description,
  });
  if (error) return { message: error.message };

  await admin.from("contracts").update({ status: "disputed" }).eq("id", contractId);
  await postSystemMessage(admin, contractId, session.userId, "A dispute was raised on this contract — AdorWorks staff will review it.");

  return {};
}

const CancelContractSchema = z.object({
  reason: z.string().trim().min(10, "Explain why in at least 10 characters."),
});

/**
 * Either contract participant cancelling an active contract — unlike a
 * dispute, this is final (no staff mediation step), so it's only allowed
 * from 'active', not from 'disputed' (resolve that first). Same
 * admin-client requirement as raiseDispute/maybeCompleteContract: RLS
 * blocks a direct client UPDATE on contracts.
 */
export async function cancelContract(contractId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const admin = createAdminClient();

  const validated = CancelContractSchema.safeParse({ reason: formData.get("reason") });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { data: contract } = await admin
    .from("contracts")
    .select("talent_id, organisation_id, status")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract) return { message: "Contract not found." };

  const { data: org } = await admin
    .from("organisations")
    .select("representative_id")
    .eq("id", contract.organisation_id)
    .maybeSingle();

  const isParticipant = session.userId === contract.talent_id || session.userId === org?.representative_id;
  if (!isParticipant) return { message: "You aren't part of this contract." };
  if (contract.status !== "active") return { message: "Only an active contract can be cancelled." };

  const { error } = await admin
    .from("contracts")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: session.userId,
      cancellation_reason: validated.data.reason,
    })
    .eq("id", contractId);
  if (error) return { message: error.message };

  await postSystemMessage(admin, contractId, session.userId, `This contract was cancelled: ${validated.data.reason}`);

  return {};
}
