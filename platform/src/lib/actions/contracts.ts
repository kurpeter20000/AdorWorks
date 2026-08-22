"use server";

import { randomUUID } from "crypto";
import { z } from "zod";
import { requireSession, requireRole } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
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
    .select("title")
    .eq("id", contract.opportunity_id)
    .maybeSingle();

  await admin.from("work_history").insert({
    talent_id: contract.talent_id,
    contract_id: contract.id,
    organisation_id: contract.organisation_id,
    title: opportunity?.title ?? "AdorWorks engagement",
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

/**
 * Mocked payment release — is_simulated stays true, provider_name stays
 * 'mock', exactly as backend/supabase/migrations/0006 describes: no
 * code path anywhere in this project ever sets is_simulated false,
 * because no real payment provider is integrated. This is the only
 * place a payment_events row is ever created from this app.
 */
export async function releasePayment(milestoneId: string): Promise<{ error?: string }> {
  const session = await requireRole("individual_client");
  const check = await requireEmployerForMilestone(milestoneId, session.userId);
  if (check.error) return { error: check.error };
  if (check.milestone!.status !== "approved") {
    return { error: "Only an approved milestone can be paid." };
  }
  const admin = check.admin;

  const { data: milestone } = await admin
    .from("milestones")
    .select("amount, currency")
    .eq("id", milestoneId)
    .maybeSingle();
  if (!milestone) return { error: "Milestone not found." };

  const { error } = await admin.from("payment_events").insert({
    milestone_id: milestoneId,
    contract_id: check.contract!.id,
    provider_name: "mock",
    external_reference: `mock_${randomUUID()}`,
    amount: milestone.amount,
    currency: milestone.currency,
  });
  if (error) return { error: error.message };

  await admin.from("milestones").update({ status: "paid" }).eq("id", milestoneId);
  return {};
}

async function postSystemMessage(
  admin: ReturnType<typeof createAdminClient>,
  contractId: string,
  senderId: string,
  body: string
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
  await admin.from("messages").insert({ conversation_id: conversation.id, sender_id: senderId, body });
}

const MessageSchema = z.object({ body: z.string().trim().min(1, "Write a message first.").max(4000) });

/** Either contract participant sending a message — creates the conversation/membership on first use. */
export async function sendMessage(contractId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const admin = createAdminClient();

  const validated = MessageSchema.safeParse({ body: formData.get("body") });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
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

  await postSystemMessage(admin, contractId, session.userId, validated.data.body);
  return {};
}
