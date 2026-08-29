import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export const NOTIFICATION_TYPES = {
  OFFER_SENT: "offer_sent",
  OFFER_RESPONDED: "offer_responded",
  MILESTONE_SUBMITTED: "milestone_submitted",
  MILESTONE_APPROVED: "milestone_approved",
  MILESTONE_PAID: "milestone_paid",
  DISPUTE_RAISED: "dispute_raised",
  DISPUTE_RESOLVED: "dispute_resolved",
  INVITATION_RECEIVED: "invitation_received",
  APPLICATION_STAGE_CHANGED: "application_stage_changed",
  INTRODUCTION_VIDEO_REVIEWED: "introduction_video_reviewed",
  MESSAGE_RECEIVED: "message_received",
  PHONE_VERIFICATION_REMINDER: "phone_verification_reminder",
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

/**
 * Writes one row to notifications (0058). Takes an admin/service-role
 * client deliberately — same "only the service layer writes these"
 * boundary as payment_events/audit_events. Fails open: a broken
 * notification write must never roll back or block the real business
 * action it's describing, same contract as logAuditEvent.
 */
export async function notifyUser(
  admin: SupabaseClient<Database>,
  input: { userId: string; type: NotificationType; title: string; body?: string; link?: string }
): Promise<void> {
  try {
    const { error } = await admin.from("notifications").insert({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    });
    if (error) console.error(`notifications insert failed for ${input.type}:`, error.message);
  } catch (err) {
    console.error(`notifications insert threw for ${input.type}:`, err);
  }
}
