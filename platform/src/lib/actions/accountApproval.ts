"use server";

import { revalidatePath } from "next/cache";
import { requireRole, STAFF_ROLES } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { staffAreaRoles } from "@/lib/domain/staffAccess";
import { approvalSection } from "@/lib/domain/approval";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";
import { notifyUser, NOTIFICATION_TYPES } from "@/lib/domain/notifications";
import { sendEmailSafely, getUserEmail } from "@/lib/email";
import { renderEmail, escapeHtml } from "@/lib/emailTemplate";
import { buildUnsubscribeUrl } from "@/lib/unsubscribeToken";
import type { UserRole } from "@/lib/database.types";

export type ApprovalResult = { error?: string };

/**
 * Staff decide on a new account (0128). Talent are decided in the Talent
 * section (verifiers, admins); employers in Organisations (same roles).
 * The change goes through the admin client — the database only lets the
 * service role change an approval — after this checks the staff member
 * works the right section.
 */
async function decide(userId: string, decision: "approved" | "declined", note: string | null): Promise<ApprovalResult> {
  const session = await requireRole(...STAFF_ROLES);
  const admin = createAdminClient();
  const { data: person } = await admin.from("profiles").select("id, role, approval_status, full_name").eq("id", userId).maybeSingle();
  if (!person) return { error: "Account not found." };
  const section = approvalSection(person.role as UserRole);
  if (!section) return { error: "This account doesn't need approval." };
  if (!staffAreaRoles(section).includes(session.role)) {
    return { error: section === "talent" ? "Talent accounts are approved in the Talent section." : "Employer accounts are approved in the Organisations section." };
  }

  const { error } = await admin
    .from("profiles")
    .update({ approval_status: decision, approval_note: note, approval_decided_at: new Date().toISOString(), approval_decided_by: session.userId })
    .eq("id", userId);
  if (error) return { error: `Could not save the decision: ${error.message}` };

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.ACCOUNT_APPROVAL_DECIDED,
    actorId: session.userId,
    subjectId: userId,
    entityType: "profiles",
    entityId: userId,
    source: "platform",
    reason: note,
    before: { approval_status: person.approval_status },
    after: { approval_status: decision },
  });

  const approved = decision === "approved";
  const isTalent = section === "talent";
  const title = approved ? "Your AdorWorks account is approved" : "We couldn't approve your AdorWorks account";
  const body = approved
    ? isTalent
      ? "Welcome! You can now apply for jobs and projects."
      : "Welcome! You can now send jobs for review and hire talent."
    : `Reason: ${note}`;
  const link = approved ? (isTalent ? "/opportunities" : "/organisation") : "/support";
  await notifyUser(admin, { userId, type: approved ? NOTIFICATION_TYPES.ACCOUNT_APPROVED : NOTIFICATION_TYPES.ACCOUNT_DECLINED, title, body, link });
  const email = await getUserEmail(admin, userId);
  await sendEmailSafely(
    email,
    title,
    renderEmail({
      heading: title,
      paragraphs: approved
        ? [escapeHtml(body)]
        : [`Reason: ${escapeHtml(note ?? "")}`, "If you think this is a mistake, or you can share more information, reply through AdorWorks support."],
      ctaLabel: approved ? (isTalent ? "Find work" : "Go to your organisation") : "Message support",
      ctaUrl: `${process.env.NEXT_PUBLIC_SITE_URL}${link}`,
      unsubscribeUrl: buildUnsubscribeUrl(userId),
    }),
    // Account decisions are sent even to people who turned off optional emails.
    { admin, recipientUserId: userId, bypassPreference: true }
  );

  revalidatePath("/operations");
  revalidatePath(isTalent ? "/operations/talent" : "/operations/organisations");
  return {};
}

export async function approveAccount(userId: string): Promise<ApprovalResult> {
  return decide(userId, "approved", null);
}

export async function declineAccount(userId: string, reason: string): Promise<ApprovalResult> {
  const note = reason.trim().slice(0, 500);
  if (note.length < 10) return { error: "Give a short reason (at least 10 characters) — the person will see it." };
  return decide(userId, "declined", note);
}
