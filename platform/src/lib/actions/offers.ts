"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { requireRole, CLIENT_ROLES } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";
import type { FormState } from "./auth";

const OfferSchema = z.object({
  paymentBasis: z.enum(["fixed", "milestone", "hourly", "daily", "monthly", "negotiable"], {
    message: "Choose how this is paid.",
  }),
  compensationAmount: z
    .string()
    .trim()
    .refine((v) => Number(v) > 0, "Enter an amount greater than zero."),
  currency: z.string().trim().min(1).default("SSP"),
  message: z.string().trim().max(2000).optional(),
});

/**
 * Employer sends an offer to a shortlisted applicant. Uses the admin
 * client deliberately, not a direct client insert — RLS's offers_insert
 * only allows creating a 'draft' (0011's guard_offers_insert trigger
 * enforces that at the database level too), on purpose: "sending" an
 * offer is a business event, not a column PATCH, so it's gated here by
 * an explicit ownership + application-stage check in TypeScript, then
 * performed as one already-sent row rather than a draft a client would
 * still need a second privileged step to send.
 */
export async function sendOffer(
  applicationId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireRole(...CLIENT_ROLES);

  const validated = OfferSchema.safeParse({
    paymentBasis: formData.get("paymentBasis"),
    compensationAmount: formData.get("compensationAmount"),
    currency: formData.get("currency") || "SSP",
    message: formData.get("message") || undefined,
  });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }
  const v = validated.data;

  const admin = createAdminClient();

  const { data: application } = await admin
    .from("applications")
    .select("id, opportunity_id, talent_id, stage")
    .eq("id", applicationId)
    .maybeSingle();
  if (!application) {
    return { message: "Application not found." };
  }
  if (!["shortlisted", "interviewing", "offered"].includes(application.stage)) {
    return { message: "This application isn't at a stage where an offer can be sent yet." };
  }

  const { data: opportunity } = await admin
    .from("opportunities")
    .select("id, organisation_id")
    .eq("id", application.opportunity_id)
    .maybeSingle();
  if (!opportunity) {
    return { message: "Opportunity not found." };
  }

  const { data: org } = await admin
    .from("organisations")
    .select("id, representative_id")
    .eq("id", opportunity.organisation_id)
    .maybeSingle();
  if (!org || org.representative_id !== session.userId) {
    return { message: "You don't have permission to send an offer for this opportunity." };
  }

  const { data: offer, error: offerError } = await admin
    .from("offers")
    .insert({
      application_id: application.id,
      opportunity_id: opportunity.id,
      talent_id: application.talent_id,
      organisation_id: org.id,
      payment_basis: v.paymentBasis,
      compensation_amount: Number(v.compensationAmount),
      currency: v.currency,
      message: v.message || null,
      status: "sent",
      created_by: session.userId,
      responded_at: null,
    })
    .select("id")
    .single();
  if (offerError || !offer) {
    return { message: `Could not send the offer: ${offerError?.message}` };
  }

  await admin.from("applications").update({ stage: "offered" }).eq("id", application.id);

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.OFFER_SENT,
    actorId: session.userId,
    subjectId: application.talent_id,
    entityType: "offers",
    entityId: offer.id,
    source: "platform",
    metadata: { opportunityId: opportunity.id, applicationId: application.id },
  });

  redirect(`/organisation/opportunities/${opportunity.id}?offered=1`);
}

/**
 * Talent accepting an offer. offers_update RLS doesn't grant talent any
 * direct-update path at all (only org-while-draft, or staff) — by
 * design, per 0007's comment: accepting changes compensation-adjacent
 * state and creates a contract, so it's a Server Action using the admin
 * client with its own ownership + status check, not a client PATCH.
 * Also creates the contract and its milestone row(s) here, in the same
 * action, so an accepted offer never exists without the work item that
 * is supposed to follow from it.
 */
export async function acceptOffer(offerId: string): Promise<{ error?: string }> {
  const session = await requireRole("talent");
  const admin = createAdminClient();

  const { data: offer } = await admin.from("offers").select("*").eq("id", offerId).maybeSingle();
  if (!offer || offer.talent_id !== session.userId) {
    return { error: "Offer not found." };
  }
  if (offer.status !== "sent") {
    return { error: "This offer can no longer be accepted." };
  }

  const { error: offerUpdateError } = await admin
    .from("offers")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", offerId);
  if (offerUpdateError) {
    return { error: offerUpdateError.message };
  }

  await admin.from("applications").update({ stage: "accepted" }).eq("id", offer.application_id);

  const { data: contract, error: contractError } = await admin
    .from("contracts")
    .insert({
      offer_id: offer.id,
      opportunity_id: offer.opportunity_id,
      talent_id: offer.talent_id,
      organisation_id: offer.organisation_id,
    })
    .select("id")
    .single();
  if (contractError || !contract) {
    return { error: contractError?.message ?? "Could not create the contract." };
  }

  const plan = Array.isArray(offer.milestone_plan) ? offer.milestone_plan : [];
  if (plan.length > 0) {
    await admin.from("milestones").insert(
      plan.map((m, i) => {
        const entry = m as { title?: string; amount?: number; sequence?: number };
        return {
          contract_id: contract.id,
          title: entry.title || `Milestone ${i + 1}`,
          amount: entry.amount ?? 0,
          currency: offer.currency,
          sequence: entry.sequence ?? i,
        };
      })
    );
  } else {
    await admin.from("milestones").insert({
      contract_id: contract.id,
      title: "Full payment",
      amount: offer.compensation_amount ?? 0,
      currency: offer.currency,
      sequence: 0,
    });
  }

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.OFFER_RESPONDED,
    actorId: session.userId,
    entityType: "offers",
    entityId: offer.id,
    source: "platform",
    after: { status: "accepted" },
  });
  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.CONTRACT_CREATED,
    actorId: session.userId,
    entityType: "contracts",
    entityId: contract.id,
    source: "platform",
    metadata: { offerId: offer.id, opportunityId: offer.opportunity_id },
  });

  return {};
}

/**
 * Talent declining an offer — same admin-client rationale as accept.
 * Stage 5 fix: this used to only touch the offer, leaving the linked
 * application stuck at 'offered' forever — a misleading state the
 * employer's own opportunity page kept showing indefinitely (Stage 5
 * gap-check finding). 'withdrawn' rather than 'rejected' — the talent is
 * the one opting out here, not the employer rejecting them.
 */
export async function declineOffer(offerId: string): Promise<{ error?: string }> {
  const session = await requireRole("talent");
  const admin = createAdminClient();

  const { data: offer } = await admin.from("offers").select("id, application_id, talent_id, status").eq("id", offerId).maybeSingle();
  if (!offer || offer.talent_id !== session.userId) {
    return { error: "Offer not found." };
  }
  if (offer.status !== "sent") {
    return { error: "This offer can no longer be declined." };
  }

  const { error } = await admin
    .from("offers")
    .update({ status: "declined", responded_at: new Date().toISOString() })
    .eq("id", offerId);
  if (error) {
    return { error: error.message };
  }

  await admin.from("applications").update({ stage: "withdrawn" }).eq("id", offer.application_id);

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.OFFER_RESPONDED,
    actorId: session.userId,
    entityType: "offers",
    entityId: offer.id,
    source: "platform",
    after: { status: "declined" },
  });

  return {};
}
