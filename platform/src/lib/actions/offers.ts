"use server";

import { ensureContractTerms } from "@/lib/dal/contractTerms";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole, CLIENT_ROLES } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";
import { notifyUser, NOTIFICATION_TYPES } from "@/lib/domain/notifications";
import { sendEmailSafely, getUserEmail } from "@/lib/email";
import { renderEmail } from "@/lib/emailTemplate";
import { buildUnsubscribeUrl } from "@/lib/unsubscribeToken";
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
function respondWithinDays(raw: FormDataEntryValue | null): number {
  const n = Number(raw);
  return n === 3 || n === 14 ? n : 7;
}

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
      // 0113: the talent must answer by this date; the database refuses a
      // later acceptance. 3, 7 or 14 days; anything else means 7.
      expires_at: new Date(Date.now() + respondWithinDays(formData.get("respondWithinDays")) * 86_400_000).toISOString(),
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
  await notifyUser(admin, {
    userId: application.talent_id,
    type: NOTIFICATION_TYPES.OFFER_SENT,
    title: "You received an offer",
    link: "/offers",
    dedupeKey: offer.id,
  });
  const offerTalentEmail = await getUserEmail(admin, application.talent_id);
  await sendEmailSafely(
    offerTalentEmail,
    "You received an offer on AdorWorks",
    renderEmail({
      heading: "You received an offer",
      paragraphs: ["An employer sent you an offer on AdorWorks."],
      ctaLabel: "View offer",
      ctaUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/offers`,
      unsubscribeUrl: buildUnsubscribeUrl(application.talent_id),
    }),
    { admin, recipientUserId: application.talent_id }
  );

  redirect(`/organisation/opportunities/${opportunity.id}?offered=1`);
}

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Atomically moves an offer from "sent" to "accepted". Returns
 * { error: "gone" } when the row was no longer "sent" by the time the
 * update ran (someone else accepted/declined/withdrew it first).
 */
async function claimOffer(admin: AdminClient, offerId: string): Promise<{ error?: string }> {
  const { data, error } = await admin
    .from("offers")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", offerId)
    .eq("status", "sent")
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "gone" };
  return {};
}

/** Undoes a half-finished acceptance so it can be retried cleanly. */
async function rollbackAcceptance(admin: AdminClient, offerId: string, contractId?: string): Promise<void> {
  if (contractId) {
    await admin.from("milestones").delete().eq("contract_id", contractId);
    await admin.from("contracts").delete().eq("id", contractId);
  }
  await admin.from("offers").update({ status: "sent", responded_at: null }).eq("id", offerId).eq("status", "accepted");
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
  if (offer.service_request_id) {
    // A service proposal is sent BY the talent — the organisation is who
    // accepts it (acceptServiceProposal), not the talent themselves. Without
    // this check, offer.talent_id === session.userId would incorrectly
    // pass here too, since that column means the same thing in both flows.
    return { error: "You can't accept your own service proposal — the employer accepts it." };
  }
  if (offer.status !== "sent") {
    return { error: "This offer can no longer be accepted." };
  }

  // Conditional claim: only flips the row if it is STILL "sent". The status
  // check above is a read; two requests (double-tap, two tabs) can both pass
  // it before either writes. Whichever update lands second matches zero rows
  // and stops here, so exactly one contract is ever created per offer.
  const claimed = await claimOffer(admin, offerId);
  if (claimed.error) return { error: claimed.error === "gone" ? "This offer can no longer be accepted." : claimed.error };

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
    await rollbackAcceptance(admin, offerId);
    return { error: contractError?.message ?? "Could not create the contract." };
  }

  const plan = Array.isArray(offer.milestone_plan) ? offer.milestone_plan : [];
  const { error: milestoneError } =
    plan.length > 0
      ? await admin.from("milestones").insert(
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
        )
      : await admin.from("milestones").insert({
          contract_id: contract.id,
          title: "Full payment",
          amount: offer.compensation_amount ?? 0,
          currency: offer.currency,
          sequence: 0,
        });
  if (milestoneError) {
    // A contract with no milestones can never be paid — undo the whole
    // acceptance so the talent can simply try again.
    await rollbackAcceptance(admin, offerId, contract.id);
    return { error: "Could not set up the contract's milestones. Nothing was accepted — please try again." };
  }

  // Only now that the contract fully exists. Guaranteed non-null: the
  // service_request_id check above already ruled out a service proposal
  // reaching this point, and 0080's origin check constraint guarantees
  // application_id is set whenever service_request_id isn't.
  await admin.from("applications").update({ stage: "accepted" }).eq("id", offer.application_id!);

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
  // Written terms (Labour Act s.44) on record from the first moment.
  await ensureContractTerms(contract.id, session.userId);
  await notifyUser(admin, {
    userId: offer.created_by,
    type: NOTIFICATION_TYPES.OFFER_RESPONDED,
    title: "Your offer was accepted",
    link: `/contracts/${contract.id}`,
    dedupeKey: offer.id,
  });
  const accepterEmail = await getUserEmail(admin, offer.created_by);
  await sendEmailSafely(
    accepterEmail,
    "Your offer was accepted on AdorWorks",
    renderEmail({
      heading: "Your offer was accepted",
      paragraphs: ["Your offer was accepted and a contract was created."],
      ctaLabel: "View contract",
      ctaUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/contracts/${contract.id}`,
      unsubscribeUrl: buildUnsubscribeUrl(offer.created_by),
    }),
    { admin, recipientUserId: offer.created_by }
  );

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

  const { data: offer } = await admin
    .from("offers")
    .select("id, application_id, service_request_id, talent_id, status, created_by")
    .eq("id", offerId)
    .maybeSingle();
  if (!offer || offer.talent_id !== session.userId) {
    return { error: "Offer not found." };
  }
  if (offer.service_request_id) {
    return { error: "You can't decline your own service proposal — the employer declines it." };
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

  // Guaranteed non-null — see the matching comment in acceptOffer above.
  await admin.from("applications").update({ stage: "withdrawn" }).eq("id", offer.application_id!);

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.OFFER_RESPONDED,
    actorId: session.userId,
    entityType: "offers",
    entityId: offer.id,
    source: "platform",
    after: { status: "declined" },
  });
  await notifyUser(admin, {
    userId: offer.created_by,
    type: NOTIFICATION_TYPES.OFFER_RESPONDED,
    title: "Your offer was declined",
    dedupeKey: offer.id,
  });
  const declinerNoticeEmail = await getUserEmail(admin, offer.created_by);
  await sendEmailSafely(
    declinerNoticeEmail,
    "Your offer was declined on AdorWorks",
    renderEmail({
      heading: "Your offer was declined",
      paragraphs: ["Your offer was declined."],
      ctaLabel: "View offers",
      ctaUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/offers`,
      unsubscribeUrl: buildUnsubscribeUrl(offer.created_by),
    }),
    { admin, recipientUserId: offer.created_by }
  );

  return {};
}

/**
 * S09-05: the organisation accepting a talent's service proposal —
 * mirrors acceptOffer above with the actor reversed (the talent sent
 * this one; the organisation is who accepts it). Creates the contract
 * with service_request_id set and opportunity_id left null (0080's
 * origin check constraint requires exactly one of the two).
 */
export async function acceptServiceProposal(offerId: string): Promise<{ error?: string }> {
  const session = await requireRole(...CLIENT_ROLES);
  const admin = createAdminClient();

  const { data: offer } = await admin.from("offers").select("*").eq("id", offerId).maybeSingle();
  if (!offer || !offer.service_request_id) {
    return { error: "Proposal not found." };
  }
  const { data: org } = await admin.from("organisations").select("representative_id").eq("id", offer.organisation_id).maybeSingle();
  const { data: membership } = await admin
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", offer.organisation_id)
    .eq("user_id", session.userId)
    .maybeSingle();
  const isOrgWriteMember = org?.representative_id === session.userId || (membership && membership.role !== "viewer");
  if (!isOrgWriteMember) {
    return { error: "You don't have permission to respond to this proposal." };
  }
  if (offer.status !== "sent") {
    return { error: "This proposal can no longer be accepted." };
  }

  // Same conditional claim as acceptOffer — two org members accepting at
  // once must not produce two contracts.
  const claimed = await claimOffer(admin, offerId);
  if (claimed.error) return { error: claimed.error === "gone" ? "This proposal can no longer be accepted." : claimed.error };

  const { data: contract, error: contractError } = await admin
    .from("contracts")
    .insert({
      offer_id: offer.id,
      service_request_id: offer.service_request_id,
      talent_id: offer.talent_id,
      organisation_id: offer.organisation_id,
    })
    .select("id")
    .single();
  if (contractError || !contract) {
    await rollbackAcceptance(admin, offerId);
    return { error: contractError?.message ?? "Could not create the contract." };
  }

  const { error: milestoneError } = await admin.from("milestones").insert({
    contract_id: contract.id,
    title: "Full payment",
    amount: offer.compensation_amount ?? 0,
    currency: offer.currency,
    sequence: 0,
  });
  if (milestoneError) {
    await rollbackAcceptance(admin, offerId, contract.id);
    return { error: "Could not set up the contract's milestones. Nothing was accepted — please try again." };
  }

  await admin.from("service_requests").update({ status: "accepted" }).eq("id", offer.service_request_id);

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
    metadata: { offerId: offer.id, serviceRequestId: offer.service_request_id },
  });
  await ensureContractTerms(contract.id, session.userId);
  await notifyUser(admin, {
    userId: offer.talent_id,
    type: NOTIFICATION_TYPES.OFFER_RESPONDED,
    title: "Your service proposal was accepted",
    link: `/contracts/${contract.id}`,
    dedupeKey: offer.id,
  });
  const proposalAcceptedEmail = await getUserEmail(admin, offer.talent_id);
  await sendEmailSafely(
    proposalAcceptedEmail,
    "Your service proposal was accepted on AdorWorks",
    renderEmail({
      heading: "Your service proposal was accepted",
      paragraphs: ["Your service proposal was accepted and a contract was created."],
      ctaLabel: "View contract",
      ctaUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/contracts/${contract.id}`,
      unsubscribeUrl: buildUnsubscribeUrl(offer.talent_id),
    }),
    { admin, recipientUserId: offer.talent_id }
  );

  revalidatePath("/organisation/service-requests");
  return {};
}

/** S09-05: the organisation declining a talent's service proposal. */
export async function declineServiceProposal(offerId: string): Promise<{ error?: string }> {
  const session = await requireRole(...CLIENT_ROLES);
  const admin = createAdminClient();

  const { data: offer } = await admin.from("offers").select("id, organisation_id, talent_id, status, service_request_id").eq("id", offerId).maybeSingle();
  if (!offer || !offer.service_request_id) {
    return { error: "Proposal not found." };
  }
  const { data: org } = await admin.from("organisations").select("representative_id").eq("id", offer.organisation_id).maybeSingle();
  const { data: membership } = await admin
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", offer.organisation_id)
    .eq("user_id", session.userId)
    .maybeSingle();
  const isOrgWriteMember = org?.representative_id === session.userId || (membership && membership.role !== "viewer");
  if (!isOrgWriteMember) {
    return { error: "You don't have permission to respond to this proposal." };
  }
  if (offer.status !== "sent") {
    return { error: "This proposal can no longer be declined." };
  }

  const { error } = await admin
    .from("offers")
    .update({ status: "declined", responded_at: new Date().toISOString() })
    .eq("id", offerId);
  if (error) return { error: error.message };

  await admin.from("service_requests").update({ status: "declined" }).eq("id", offer.service_request_id);

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.OFFER_RESPONDED,
    actorId: session.userId,
    entityType: "offers",
    entityId: offer.id,
    source: "platform",
    after: { status: "declined" },
  });
  await notifyUser(admin, {
    userId: offer.talent_id,
    type: NOTIFICATION_TYPES.OFFER_RESPONDED,
    title: "Your service proposal was declined",
    dedupeKey: offer.id,
  });
  const proposalDeclinedEmail = await getUserEmail(admin, offer.talent_id);
  await sendEmailSafely(
    proposalDeclinedEmail,
    "Your service proposal was declined on AdorWorks",
    renderEmail({
      heading: "Your service proposal was declined",
      paragraphs: ["Your service proposal was declined."],
      ctaLabel: "View your services",
      ctaUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/passport/services/requests`,
      unsubscribeUrl: buildUnsubscribeUrl(offer.talent_id),
    }),
    { admin, recipientUserId: offer.talent_id }
  );

  revalidatePath("/organisation/service-requests");
  return {};
}
