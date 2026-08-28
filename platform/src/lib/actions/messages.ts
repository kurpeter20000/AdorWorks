"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser, NOTIFICATION_TYPES } from "@/lib/domain/notifications";
import type { FormState } from "./auth";

/**
 * Pre-contract messaging (Stage 7): the `conversations`/`messages` tables
 * have supported an `application_id` scope since 0006, but until now
 * every conversation was created contract-scoped only (see
 * postSystemMessage in contracts.ts) — an employer had no way to talk to
 * a candidate before an offer exists. RLS on conversations/
 * conversation_members/messages is already generic (gated purely by
 * conversation_members rows, not by which scope column is set), so no
 * migration is needed here — only this action and its own membership
 * bookkeeping. Text-only, deliberately: the message-attachments storage
 * bucket policy (0024) is keyed to is_contract_participant() folders
 * only, and extending it to applications too is its own follow-up.
 */

const MessageSchema = z.object({
  body: z.string().trim().min(1, "Write a message before sending.").max(4000),
});

async function getApplicationParties(admin: ReturnType<typeof createAdminClient>, applicationId: string) {
  const { data: application } = await admin
    .from("applications")
    .select("talent_id, opportunity_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (!application) return null;
  const { data: opportunity } = await admin
    .from("opportunities")
    .select("organisation_id")
    .eq("id", application.opportunity_id)
    .maybeSingle();
  if (!opportunity) return null;
  const { data: org } = await admin
    .from("organisations")
    .select("representative_id")
    .eq("id", opportunity.organisation_id)
    .maybeSingle();
  return {
    talentId: application.talent_id,
    employerId: org?.representative_id ?? null,
    opportunityId: application.opportunity_id,
  };
}

/**
 * Either side of an application (the talent, or the opportunity's org
 * representative) sending a message — creates the conversation/
 * membership on first use, same pattern as postSystemMessage in
 * contracts.ts but keyed by application_id instead of contract_id.
 */
export async function sendApplicationMessage(
  applicationId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireSession();
  const admin = createAdminClient();

  const validated = MessageSchema.safeParse({ body: formData.get("body") || "" });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const parties = await getApplicationParties(admin, applicationId);
  if (!parties) return { message: "Application not found." };

  const isParticipant = session.userId === parties.talentId || session.userId === parties.employerId;
  if (!isParticipant) return { message: "You aren't part of this application." };

  let { data: conversation } = await admin
    .from("conversations")
    .select("id")
    .eq("application_id", applicationId)
    .maybeSingle();
  if (!conversation) {
    const { data: created } = await admin
      .from("conversations")
      .insert({ application_id: applicationId })
      .select("id")
      .single();
    conversation = created ?? null;
    if (conversation) {
      const memberIds = [parties.talentId, parties.employerId].filter(Boolean) as string[];
      if (memberIds.length > 0) {
        await admin
          .from("conversation_members")
          .insert(memberIds.map((user_id) => ({ conversation_id: conversation!.id, user_id })));
      }
    }
  }
  if (!conversation) return { message: "Could not open this conversation." };

  const { error } = await admin.from("messages").insert({
    conversation_id: conversation.id,
    sender_id: session.userId,
    body: validated.data.body,
  });
  if (error) return { message: error.message };

  const recipientId = session.userId === parties.talentId ? parties.employerId : parties.talentId;
  if (recipientId) {
    await notifyUser(admin, {
      userId: recipientId,
      type: NOTIFICATION_TYPES.MESSAGE_RECEIVED,
      title: "New message about your application",
      link: session.userId === parties.talentId ? `/organisation/opportunities/${parties.opportunityId}` : "/applications",
    });
  }

  revalidatePath("/applications");
  revalidatePath(`/organisation/opportunities/${parties.opportunityId}`);
  return {};
}
