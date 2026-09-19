import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { logAuditEvent } from "./audit";
import { DOMAIN_EVENTS } from "./events";

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
  EVIDENCE_REVIEWED: "evidence_reviewed",
  MESSAGE_RECEIVED: "message_received",
  PHONE_VERIFICATION_REMINDER: "phone_verification_reminder",
  OPPORTUNITY_PUBLISHED: "opportunity_published",
  OPPORTUNITY_REJECTED: "opportunity_rejected",
  OPPORTUNITY_CHANGES_REQUESTED: "opportunity_changes_requested",
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

/**
 * Writes one row to notifications (0058). Takes an admin/service-role
 * client deliberately — same "only the service layer writes these"
 * boundary as payment_events/audit_events. Fails open: a broken
 * notification write must never roll back or block the real business
 * action it's describing, same contract as logAuditEvent.
 *
 * S11-05: pass `dedupeKey` to protect against a double form submit or
 * retried action writing the same notification twice — 0085's unique
 * index on (user_id, type, dedupe_key) then silently no-ops a repeat
 * instead of inserting a second row. Only pass it when this exact
 * (user, type) pairing genuinely can't legitimately recur for a
 * different reason later (see 0085's comment) — omit it otherwise and
 * every call behaves exactly as before.
 *
 * S11-06: a failed write is no longer silent — it's also recorded to
 * audit_events (already staff-visible via GET /api/people/audit-events)
 * so a systemic delivery problem shows up somewhere a human can see it,
 * not just in a server log nobody is watching.
 */
export async function notifyUser(
  admin: SupabaseClient<Database>,
  input: { userId: string; type: NotificationType; title: string; body?: string; link?: string; dedupeKey?: string }
): Promise<void> {
  try {
    const row = {
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    };
    const { error } = input.dedupeKey
      ? await admin
          .from("notifications")
          .upsert({ ...row, dedupe_key: input.dedupeKey }, { onConflict: "user_id,type,dedupe_key", ignoreDuplicates: true })
      : await admin.from("notifications").insert(row);
    if (error) {
      console.error(`notifications insert failed for ${input.type}:`, error.message);
      await logAuditEvent(admin, {
        name: DOMAIN_EVENTS.NOTIFICATION_DELIVERY_FAILED,
        actorId: null,
        subjectId: input.userId,
        entityType: "notifications",
        entityId: input.userId,
        source: "platform",
        reason: error.message,
        metadata: { type: input.type },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`notifications insert threw for ${input.type}:`, err);
    await logAuditEvent(admin, {
      name: DOMAIN_EVENTS.NOTIFICATION_DELIVERY_FAILED,
      actorId: null,
      subjectId: input.userId,
      entityType: "notifications",
      entityId: input.userId,
      source: "platform",
      reason: message,
      metadata: { type: input.type },
    });
  }
}
