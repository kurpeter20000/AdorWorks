"use server";

import { msg } from "@/i18n/config";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSession, requireRole } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser, NOTIFICATION_TYPES } from "@/lib/domain/notifications";
import { sendEmailSafely, getUserEmail } from "@/lib/email";
import { renderEmail } from "@/lib/emailTemplate";
import { buildUnsubscribeUrl } from "@/lib/unsubscribeToken";
import { containsContactDetails, CONTACT_DETAIL_BLOCKED_MESSAGE } from "@/lib/domain/messageFilter";
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
  body: z.string().trim().min(1, msg("Write a message before sending.")).max(4000),
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
  if (!parties) return { message: msg("Application not found.") };

  // Pre-contract: no payment can exist yet, so this is always filtered
  // (Stage 16 step 3) — the same rule contract chat applies conditionally.
  if (containsContactDetails(validated.data.body)) {
    return { message: CONTACT_DETAIL_BLOCKED_MESSAGE };
  }

  const isParticipant = session.userId === parties.talentId || session.userId === parties.employerId;
  if (!isParticipant) return { message: msg("You aren't part of this application.") };

  let { data: conversation } = await admin
    .from("conversations")
    .select("id")
    .eq("application_id", applicationId)
    .maybeSingle();
  if (!conversation) {
    const { data: created, error: createError } = await admin
      .from("conversations")
      .insert({ application_id: applicationId })
      .select("id")
      .single();
    if (createError?.code === "23505") {
      // Lost a race with a concurrent first message — 0059's unique
      // index means someone else's insert already won; use their row
      // instead of forking a duplicate conversation.
      const { data: existing } = await admin.from("conversations").select("id").eq("application_id", applicationId).maybeSingle();
      conversation = existing ?? null;
    } else {
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
  }
  if (!conversation) return { message: msg("Could not open this conversation.") };

  const { error } = await admin.from("messages").insert({
    conversation_id: conversation.id,
    sender_id: session.userId,
    body: validated.data.body,
  });
  if (error) return { message: error.message };

  const recipientId = session.userId === parties.talentId ? parties.employerId : parties.talentId;
  if (recipientId) {
    const recipientLink = session.userId === parties.talentId ? `/organisation/opportunities/${parties.opportunityId}` : "/applications";
    await notifyUser(admin, {
      userId: recipientId,
      type: NOTIFICATION_TYPES.MESSAGE_RECEIVED,
      title: "New message about your application",
      link: recipientLink,
    });
    // S11-04: was in-app only. Doesn't repeat the message text — same
    // restraint as the contract-message email (read it in the app).
    const recipientEmail = await getUserEmail(admin, recipientId);
    await sendEmailSafely(
      recipientEmail,
      "New message on AdorWorks",
      renderEmail({
        heading: "New message",
        paragraphs: ["You have a new message about one of your applications."],
        ctaLabel: "View message",
        ctaUrl: `${process.env.NEXT_PUBLIC_SITE_URL}${recipientLink}`,
        unsubscribeUrl: buildUnsubscribeUrl(recipientId),
      }),
      { admin, recipientUserId: recipientId }
    );
  }

  revalidatePath("/applications");
  revalidatePath(`/organisation/opportunities/${parties.opportunityId}`);
  return {};
}

const STAFF_INTERVIEW_ROLES = ["matcher", "admin"] as const;

/**
 * Owner decision (2026-11-16): messaging stays inside Contracts, plus
 * staff and an applicant may message during the interview stage (once
 * shortlisted). For staff-assisted hiring, where staff run the shortlist.
 * Same contact-detail filter as every pre-contract message.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Staff interview tools are for staff-assisted roles only (the employer runs self-service hiring). */
async function isStaffAssistedApplication(admin: ReturnType<typeof createAdminClient>, applicationId: string): Promise<boolean> {
  if (!UUID.test(applicationId)) return false;
  const { data } = await admin.from("applications").select("opportunity_id").eq("id", applicationId).maybeSingle();
  if (!data) return false;
  const { data: opp } = await admin.from("opportunities").select("shortlisting_mode").eq("id", data.opportunity_id).maybeSingle();
  return opp?.shortlisting_mode === "staff_assisted";
}

export async function staffMessageApplicant(applicationId: string, body: string): Promise<{ error?: string }> {
  const session = await requireRole(...STAFF_INTERVIEW_ROLES);
  const validated = MessageSchema.safeParse({ body });
  if (!validated.success) return { error: validated.error.issues[0]?.message ?? "Write a message." };
  if (containsContactDetails(validated.data.body)) return { error: CONTACT_DETAIL_BLOCKED_MESSAGE };

  const admin = createAdminClient();
  if (!(await isStaffAssistedApplication(admin, applicationId))) return { error: "Staff message applicants only on staff-assisted roles." };
  const { data: app } = await admin.from("applications").select("stage").eq("id", applicationId).maybeSingle();
  if (!app || !["shortlisted", "interviewing"].includes(app.stage)) {
    return { error: "Staff can message an applicant once they're shortlisted or interviewing." };
  }
  const parties = await getApplicationParties(admin, applicationId);
  if (!parties) return { error: "Application not found." };

  let { data: conversation } = await admin.from("conversations").select("id").eq("application_id", applicationId).maybeSingle();
  if (!conversation) {
    const { data: created, error } = await admin.from("conversations").insert({ application_id: applicationId }).select("id").single();
    if (error?.code === "23505") {
      ({ data: conversation } = await admin.from("conversations").select("id").eq("application_id", applicationId).maybeSingle());
    } else if (created) {
      conversation = created;
      const memberIds = [parties.talentId, parties.employerId].filter(Boolean) as string[];
      if (memberIds.length > 0) {
        await admin.from("conversation_members").insert(memberIds.map((user_id) => ({ conversation_id: created.id, user_id })));
      }
    }
  }
  if (!conversation) return { error: "Could not open this conversation." };

  // The applicant's thread shows anyone else as "the other side"; say
  // plainly that this is AdorWorks, not the employer.
  const { error } = await admin.from("messages").insert({
    conversation_id: conversation.id,
    sender_id: session.userId,
    body: `AdorWorks team: ${validated.data.body}`,
  });
  if (error) return { error: error.message };

  await notifyUser(admin, {
    userId: parties.talentId,
    type: NOTIFICATION_TYPES.MESSAGE_RECEIVED,
    title: "AdorWorks sent you a message about your application",
    link: "/applications",
  });
  revalidatePath("/applications");
  return {};
}

/** Staff view of an application's interview times and messages. */
export async function getStaffInterviewView(applicationId: string): Promise<{
  slots: { id: string; starts_at: string; mode: string; details: string | null; status: string }[];
  messages: { id: string; body: string; created_at: string; fromTalent: boolean }[];
}> {
  await requireRole(...STAFF_INTERVIEW_ROLES);
  const admin = createAdminClient();
  if (!(await isStaffAssistedApplication(admin, applicationId))) return { slots: [], messages: [] };
  const [{ data: app }, { data: slots }, { data: conversation }] = await Promise.all([
    admin.from("applications").select("talent_id").eq("id", applicationId).maybeSingle(),
    admin.from("interview_slots").select("id, starts_at, mode, details, status").eq("application_id", applicationId).order("starts_at"),
    admin.from("conversations").select("id").eq("application_id", applicationId).maybeSingle(),
  ]);
  const { data: messages } = conversation
    ? await admin.from("messages").select("id, sender_id, body, created_at").eq("conversation_id", conversation.id).order("created_at").limit(50)
    : { data: [] };
  return {
    slots: slots ?? [],
    messages: (messages ?? []).map((m) => ({ id: m.id, body: m.body, created_at: m.created_at, fromTalent: m.sender_id === app?.talent_id })),
  };
}
