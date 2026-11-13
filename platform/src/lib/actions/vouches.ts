"use server";

import { msg } from "@/i18n/config";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";
import { notifyUser, NOTIFICATION_TYPES } from "@/lib/domain/notifications";
import { sendEmailSafely, getUserEmail } from "@/lib/email";
import { renderEmail, escapeHtml } from "@/lib/emailTemplate";
import { buildUnsubscribeUrl } from "@/lib/unsubscribeToken";
import type { FormState } from "./auth";

/**
 * 0107 — vouches. A talent asks someone who already has an AdorWorks
 * account and knows them personally to vouch for them; the voucher has to
 * actively confirm, the same way a real-world reference only counts once
 * the person actually answers for you. This is the digitized version of
 * the word-of-mouth/personal-network referral that the pain-point
 * research found actually dominates hiring here — not a cold marketplace
 * primitive, so it deliberately refuses to vouch-by-email for someone who
 * isn't already a real account (see requestVouch below).
 */

const RequestVouchSchema = z.object({
  email: z.string().trim().email(),
  relationship: z.string().trim().min(2).max(120),
  statement: z.string().trim().max(500).optional(),
});

export async function requestVouch(_prevState: FormState, formData: FormData): Promise<FormState & { success?: boolean }> {
  const session = await requireRole("talent");

  const validated = RequestVouchSchema.safeParse({
    email: formData.get("email"),
    relationship: formData.get("relationship"),
    statement: formData.get("statement") || undefined,
  });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }
  const v = validated.data;

  const admin = createAdminClient();

  // Same lookup idiom as organisationTeam.ts's inviteTeamMember — but
  // unlike that flow, this one does NOT create an account for a
  // not-yet-registered email. A vouch is only worth anything if it comes
  // from someone who's already a real, accountable AdorWorks member;
  // auto-provisioning a stranger's account to vouch for someone would
  // make the signal meaningless.
  const { data: existingUsers, error: listError } = await admin.auth.admin.listUsers();
  if (listError) return { message: msg(`Could not look up that account: ${listError.message}`) };
  const voucher = existingUsers.users.find((u) => u.email?.toLowerCase() === v.email.toLowerCase());
  if (!voucher) {
    return {
      message: msg("That person doesn't have an AdorWorks account yet. Ask them to sign up first, then send the request again."),
    };
  }
  if (voucher.id === session.userId) {
    return { message: msg("You can't vouch for yourself.") };
  }

  const { error } = await admin.from("vouches").insert({
    talent_id: session.userId,
    voucher_id: voucher.id,
    relationship: v.relationship,
    statement: v.statement || null,
  });
  if (error) {
    if (error.code === "23505") return { message: msg("You've already asked this person to vouch for you.") };
    return { message: msg(`Could not send this request: ${error.message}`) };
  }

  const { data: talentProfile } = await admin.from("profiles").select("full_name").eq("id", session.userId).maybeSingle();
  await notifyUser(admin, {
    userId: voucher.id,
    type: NOTIFICATION_TYPES.VOUCH_REQUESTED,
    title: `${talentProfile?.full_name || "Someone on AdorWorks"} asked you to vouch for them`,
    link: "/vouches",
  });
  const voucherEmail = await getUserEmail(admin, voucher.id);
  await sendEmailSafely(
    voucherEmail,
    "Someone on AdorWorks asked you to vouch for them",
    renderEmail({
      heading: "A vouch request",
      paragraphs: [
        `<strong>${escapeHtml(talentProfile?.full_name || "Someone")}</strong> listed you as a ${escapeHtml(v.relationship)} and asked you to vouch for them on AdorWorks.`,
        "Vouching takes a minute and helps employers trust someone who's new to the platform — the same way a personal reference always has.",
      ],
      ctaLabel: "Respond to this request",
      ctaUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/vouches`,
      unsubscribeUrl: buildUnsubscribeUrl(voucher.id),
    }),
    { admin, recipientUserId: voucher.id }
  );

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.VOUCH_REQUESTED,
    actorId: session.userId,
    subjectId: voucher.id,
    entityType: "vouches",
    entityId: session.userId,
    source: "platform",
  });

  revalidatePath("/vouches");
  return { success: true };
}

/**
 * Confirm or decline — same explicit-ownership-then-admin-write shape as
 * invitations.ts's acceptInvitation/declineInvitation, for the same
 * reason: the recipient of a request is still a privileged actor here
 * (their decision is what makes a vouch count at all), not a plain owner
 * of their own row.
 */
export async function respondToVouch(vouchId: string, accept: boolean): Promise<{ error?: string }> {
  // Any signed-in, active account can be asked to vouch — a voucher's
  // role doesn't matter, only that they're a real person on the platform.
  const session = await requireSession();
  const admin = createAdminClient();

  const { data: vouch } = await admin.from("vouches").select("id, voucher_id, status").eq("id", vouchId).maybeSingle();
  if (!vouch || vouch.voucher_id !== session.userId) {
    return { error: msg("Vouch request not found.") };
  }
  if (vouch.status !== "pending") {
    return { error: msg("This request has already been responded to.") };
  }

  const { error } = await admin
    .from("vouches")
    .update({ status: accept ? "confirmed" : "declined", responded_at: new Date().toISOString() })
    .eq("id", vouchId);
  if (error) return { error: error.message };

  const { data: fullVouch } = await admin.from("vouches").select("talent_id").eq("id", vouchId).maybeSingle();
  if (fullVouch) {
    await notifyUser(admin, {
      userId: fullVouch.talent_id,
      type: NOTIFICATION_TYPES.VOUCH_RESPONDED,
      title: accept ? "Someone confirmed their vouch for you" : "A vouch request was declined",
      link: "/passport",
    });
  }

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.VOUCH_RESPONDED,
    actorId: session.userId,
    entityType: "vouches",
    entityId: vouchId,
    source: "platform",
    metadata: { accepted: accept },
  });

  revalidatePath("/vouches");
  revalidatePath("/passport");
  return {};
}
