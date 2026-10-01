/**
 * AdorWorks' escrow hold (Stage 16 step 4, migration 0099): built in full
 * but switched off for real money — the public site states AdorWorks
 * does not hold client funds, and that stays true until the "is holding
 * client funds a regulated payment activity" question (see
 * docs/stage-16-payments-messaging-and-trust.md) is answered and an MTN
 * disbursement agreement exists.
 *
 * When enabled, a milestone payment's employer-side charge still
 * succeeds immediately as today (payment_events.status='succeeded',
 * milestone marked 'paid') — escrow only delays and tracks the separate
 * step of disbursing the talent's net share, via a dispute window on the
 * same payment_events row (escrow_status/dispute_window_ends_at).
 *
 * The rates live in platform_settings (key 'escrow'), editable by
 * finance/admin staff at /operations/settings, same pattern as fees.ts.
 */
export interface EscrowSettings {
  enabled: boolean;
  disputeWindowDays: number;
}

/** Used when settings can't be read, or escrow is off: release immediately (today's behaviour). */
export const ESCROW_OFF: EscrowSettings = { enabled: false, disputeWindowDays: 0 };

/** Sane bounds for a value typed into the settings screen. */
export const MIN_DISPUTE_WINDOW_DAYS = 1;
export const MAX_DISPUTE_WINDOW_DAYS = 30;

function clampDays(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return MIN_DISPUTE_WINDOW_DAYS;
  return Math.min(Math.max(Math.round(n), MIN_DISPUTE_WINDOW_DAYS), MAX_DISPUTE_WINDOW_DAYS);
}

/** Reads the 'escrow' settings row (jsonb) defensively — anything malformed means off. */
export function parseEscrowSettings(value: unknown): EscrowSettings {
  if (!value || typeof value !== "object") return ESCROW_OFF;
  const v = value as Record<string, unknown>;
  const enabled = v.enabled === true;
  if (!enabled) return ESCROW_OFF;
  return { enabled, disputeWindowDays: clampDays(v.dispute_window_days) };
}

/** Reads the stored settings even while switched off (for the settings screen). */
export function parseEscrowRates(value: unknown): EscrowSettings {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return { enabled: v.enabled === true, disputeWindowDays: clampDays(v.dispute_window_days) };
}

export function disputeWindowEndsAt(settings: EscrowSettings, from: Date = new Date()): Date {
  return new Date(from.getTime() + settings.disputeWindowDays * 24 * 60 * 60 * 1000);
}
