/**
 * Spec "Alerts by SMS, WhatsApp or email … channel and quiet hours
 * editable in settings" (owner: WhatsApp). Which notification types count
 * as which alert topic, and whether a moment falls in someone's quiet
 * hours. Pure, so it can be tested.
 */
export type AlertTopic = "application_updates" | "messages" | "new_matching_work";

const TOPIC_BY_TYPE: Record<string, AlertTopic> = {
  application_stage_changed: "application_updates",
  offer_sent: "application_updates",
  invitation_received: "application_updates",
  interview_times_offered: "application_updates",
  interview_time_chosen: "application_updates",
  interview_reminder: "application_updates",
  milestone_approved: "application_updates",
  milestone_paid: "application_updates",
  escrow_released: "application_updates",
  payout_failed: "application_updates",
  bank_transfer_received: "application_updates",
  message_received: "messages",
  support_message_received: "messages",
};

export function alertTopicFor(type: string): AlertTopic | null {
  return TOPIC_BY_TYPE[type] ?? null;
}

/** "21:00:00" → minutes after midnight. */
function minutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

/**
 * Is `at` inside quiet hours [from, until) in `timeZone`? Handles ranges
 * that cross midnight (21:00–07:00). No quiet hours → never quiet.
 */
export function isQuietTime(at: Date, quietFrom: string | null, quietUntil: string | null, timeZone: string): boolean {
  if (!quietFrom || !quietUntil) return false;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const now = Number(parts.find((p) => p.type === "hour")!.value) * 60 + Number(parts.find((p) => p.type === "minute")!.value);
  const from = minutes(quietFrom);
  const until = minutes(quietUntil);
  if (from === until) return false;
  return from < until ? now >= from && now < until : now >= from || now < until;
}
