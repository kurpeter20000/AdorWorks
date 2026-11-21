"use server";

import { requireRole } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmailSafely, getUserEmail } from "@/lib/email";
import { renderEmail, escapeHtml } from "@/lib/emailTemplate";

/**
 * Spec "Suspend and restore … user can appeal": the person is told by
 * email (a suspended account can't sign in to read a notification).
 * The staff console calls these right after the staff API has made the
 * change; each one re-reads the account so it only ever describes what
 * is actually true. Account notices ignore marketing unsubscribes.
 */
const NOTICE_ROLES = ["admin", "trust_safety"] as const;
const site = () => process.env.NEXT_PUBLIC_SITE_URL ?? "";

export async function sendSuspensionNotice(profileId: string): Promise<{ error?: string }> {
  await requireRole(...NOTICE_ROLES);
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("status, suspended_reason").eq("id", profileId).maybeSingle();
  if (profile?.status !== "suspended") return { error: "This account isn't suspended." };
  const email = await getUserEmail(admin, profileId);
  await sendEmailSafely(
    email,
    "Your AdorWorks account has been suspended",
    renderEmail({
      heading: "Your account has been suspended",
      paragraphs: [
        "We've suspended your AdorWorks account, so you can't sign in for now.",
        ...(profile.suspended_reason ? [`<strong>Reason:</strong> ${escapeHtml(profile.suspended_reason)}`] : []),
        "If you think this is a mistake, you can appeal. A member of our Trust &amp; Safety team will review it and email you the outcome.",
      ],
      ctaLabel: "Appeal this decision",
      ctaUrl: `${site()}/appeal`,
    }),
    { admin, recipientUserId: profileId, bypassPreference: true }
  );
  return {};
}

export async function sendReinstatementNotice(profileId: string): Promise<{ error?: string }> {
  await requireRole(...NOTICE_ROLES);
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("status").eq("id", profileId).maybeSingle();
  if (profile?.status !== "active") return { error: "This account isn't active." };
  const email = await getUserEmail(admin, profileId);
  await sendEmailSafely(
    email,
    "Your AdorWorks account is active again",
    renderEmail({
      heading: "Your account is active again",
      paragraphs: [
        "We've lifted the suspension on your AdorWorks account.",
        // The suspension changed their password to sign them out everywhere.
        "For your security your old password no longer works. Choose “Forgot password” on the sign-in page to set a new one.",
      ],
      ctaLabel: "Set a new password",
      ctaUrl: `${site()}/forgot-password`,
    }),
    { admin, recipientUserId: profileId, bypassPreference: true }
  );
  return {};
}

export async function sendAppealUpheldNotice(profileId: string, note: string): Promise<{ error?: string }> {
  await requireRole(...NOTICE_ROLES);
  const admin = createAdminClient();
  const email = await getUserEmail(admin, profileId);
  await sendEmailSafely(
    email,
    "The outcome of your AdorWorks appeal",
    renderEmail({
      heading: "We reviewed your appeal",
      paragraphs: [
        "Thank you for writing to us. A member of our Trust &amp; Safety team reviewed your appeal, and your account stays suspended.",
        escapeHtml(note),
      ],
    }),
    { admin, recipientUserId: profileId, bypassPreference: true }
  );
  return {};
}
