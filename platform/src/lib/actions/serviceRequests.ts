"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole, CLIENT_ROLES } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";
import { notifyUser, NOTIFICATION_TYPES } from "@/lib/domain/notifications";
import type { FormState } from "./auth";

/**
 * S09-03: an employer requests a specific published service from its
 * talent. Plain client — service_requests_insert RLS (0079) is the real
 * gate: org write-member, and the request's talent_id must match that
 * service's real, currently-published owner.
 */
export async function requestService(
  organisationId: string,
  talentServiceId: string,
  talentId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireRole(...CLIENT_ROLES);

  const message = String(formData.get("message") || "").trim() || null;

  const supabase = await createClient();
  const { data: request, error } = await supabase
    .from("service_requests")
    .insert({
      talent_service_id: talentServiceId,
      organisation_id: organisationId,
      talent_id: talentId,
      requested_by: session.userId,
      message,
    })
    .select("id")
    .single();
  if (error) return { message: `Could not send this request: ${error.message}` };

  const admin = createAdminClient();
  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.SERVICE_REQUESTED,
    actorId: session.userId,
    subjectId: talentId,
    entityType: "service_requests",
    entityId: request.id,
    source: "platform",
    metadata: { organisationId, talentServiceId },
  });
  await notifyUser(admin, {
    userId: talentId,
    type: NOTIFICATION_TYPES.APPLICATION_STAGE_CHANGED,
    title: "An employer requested one of your services",
    link: "/passport/services/requests",
    dedupeKey: request.id,
  });

  revalidatePath("/services");
  return {};
}

async function requireOwnRequest(serviceRequestId: string) {
  const session = await requireRole("talent");
  const admin = createAdminClient();
  const { data: request } = await admin
    .from("service_requests")
    .select("id, talent_id, organisation_id, talent_service_id, status")
    .eq("id", serviceRequestId)
    .maybeSingle();
  if (!request || request.talent_id !== session.userId) {
    throw new Error("Request not found.");
  }
  return { session, admin, request };
}

const ProposalSchema = z.object({
  price: z.string().trim().refine((v) => Number(v) > 0, "Enter an amount greater than zero."),
  currency: z.string().trim().min(1).default("SSP"),
  timelineDays: z.string().trim().refine((v) => Number(v) > 0 && Number.isInteger(Number(v)), "Enter a whole number of days."),
  message: z.string().trim().max(2000).optional(),
});

/**
 * S09-04: the talent's proposal in response to a request — reuses the
 * `offers` table (0080 added service_request_id + made application_id/
 * opportunity_id nullable) rather than a separate table, since a
 * proposal is exactly offer-shaped (price, terms, a message) and this
 * keeps the downstream accept path (contract + milestone creation)
 * identical to the job-opportunity flow. Direction is reversed from a
 * job offer: the TALENT creates this row (via the admin client, same
 * "business event, not a column PATCH" reasoning sendOffer already
 * follows), and the ORGANISATION is who accepts or declines it
 * (acceptServiceProposal/declineServiceProposal in offers.ts).
 */
export async function submitServiceProposal(
  serviceRequestId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const { session, admin, request } = await requireOwnRequest(serviceRequestId);
  if (request.status !== "pending") {
    return { message: "This request has already been responded to." };
  }

  const validated = ProposalSchema.safeParse({
    price: formData.get("price"),
    currency: formData.get("currency") || "SSP",
    timelineDays: formData.get("timelineDays"),
    message: formData.get("message") || undefined,
  });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }
  const v = validated.data;

  const { data: offer, error: offerError } = await admin
    .from("offers")
    .insert({
      service_request_id: request.id,
      talent_id: session.userId,
      organisation_id: request.organisation_id,
      payment_basis: "fixed",
      compensation_amount: Number(v.price),
      currency: v.currency,
      message: `${v.message ? `${v.message}\n\n` : ""}Proposed timeline: ${v.timelineDays} day(s).`,
      status: "sent",
      created_by: session.userId,
    })
    .select("id")
    .single();
  if (offerError || !offer) {
    return { message: `Could not send this proposal: ${offerError?.message}` };
  }

  await admin.from("service_requests").update({ status: "proposed", responded_at: new Date().toISOString() }).eq("id", request.id);

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.OFFER_SENT,
    actorId: session.userId,
    entityType: "offers",
    entityId: offer.id,
    source: "platform",
    metadata: { serviceRequestId: request.id, organisationId: request.organisation_id },
  });
  const { data: org } = await admin.from("organisations").select("representative_id").eq("id", request.organisation_id).maybeSingle();
  if (org?.representative_id) {
    await notifyUser(admin, {
      userId: org.representative_id,
      type: NOTIFICATION_TYPES.OFFER_SENT,
      title: "You received a service proposal",
      link: "/organisation/service-requests",
      dedupeKey: offer.id,
    });
  }

  revalidatePath("/passport/services/requests");
  return {};
}

/** S09-04: the talent declining a request outright, without proposing. */
export async function declineServiceRequest(serviceRequestId: string): Promise<{ error?: string }> {
  const { admin, request } = await requireOwnRequest(serviceRequestId);
  if (request.status !== "pending") {
    return { error: "This request has already been responded to." };
  }

  const { error } = await admin
    .from("service_requests")
    .update({ status: "declined", responded_at: new Date().toISOString() })
    .eq("id", request.id);
  if (error) return { error: error.message };

  const { data: org } = await admin.from("organisations").select("representative_id").eq("id", request.organisation_id).maybeSingle();
  if (org?.representative_id) {
    await notifyUser(admin, {
      userId: org.representative_id,
      type: NOTIFICATION_TYPES.OFFER_RESPONDED,
      title: "A service request was declined",
      dedupeKey: request.id,
    });
  }

  revalidatePath("/passport/services/requests");
  return {};
}

/** Employer-side: withdraw a request that hasn't been responded to yet. */
export async function withdrawServiceRequest(serviceRequestId: string, organisationId: string): Promise<{ error?: string }> {
  await requireRole(...CLIENT_ROLES);

  const supabase = await createClient();
  const { error } = await supabase
    .from("service_requests")
    .update({ status: "withdrawn", responded_at: new Date().toISOString() })
    .eq("id", serviceRequestId)
    .eq("organisation_id", organisationId)
    .eq("status", "pending");
  if (error) return { error: error.message };

  revalidatePath("/organisation/service-requests");
  return {};
}
