/**
 * AdorWorks' platform fees (Stage 16, founder decision 2026-10-01):
 * the employer pays a fee ON TOP of the agreed amount (2.5%), and the
 * talent receives the agreed amount MINUS a fee (7.5%). AdorWorks'
 * revenue on a payment is the sum of both.
 *
 * The rates live in the platform_settings table (key 'fees', migration
 * 0096), editable by finance/admin staff at /operations/settings, with an
 * on/off switch — the public Pricing page promises 0% until fees are
 * announced. Every fee is stamped onto the payment record at charge time,
 * so changing a rate never rewrites a past payment.
 */
export interface FeeSettings {
  enabled: boolean;
  employerPercent: number;
  talentPercent: number;
}

/** Used when settings can't be read: charge nothing rather than guess. */
export const FEES_OFF: FeeSettings = { enabled: false, employerPercent: 0, talentPercent: 0 };

/** Sane upper bound for a rate typed into the settings screen. */
export const MAX_FEE_PERCENT = 30;

export interface FeeBreakdown {
  /** The agreed amount (milestone/contract price). */
  amount: number;
  employerFeePercent: number;
  employerFeeAmount: number;
  /** What the employer pays: amount + employer fee. */
  totalCharged: number;
  talentFeePercent: number;
  talentFeeAmount: number;
  /** What the talent receives: amount - talent fee. */
  netAmount: number;
  /** AdorWorks' share: both fees. */
  platformRevenue: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function clampPercent(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, MAX_FEE_PERCENT);
}

/** Reads the 'fees' settings row (jsonb) defensively — anything malformed means no fee. */
export function parseFeeSettings(value: unknown): FeeSettings {
  if (!value || typeof value !== "object") return FEES_OFF;
  const v = value as Record<string, unknown>;
  const enabled = v.enabled === true;
  if (!enabled) return FEES_OFF;
  return { enabled, employerPercent: clampPercent(v.employer_percent), talentPercent: clampPercent(v.talent_percent) };
}

/** Reads the stored rates even while switched off (for the settings screen). */
export function parseFeeRates(value: unknown): FeeSettings {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return { enabled: v.enabled === true, employerPercent: clampPercent(v.employer_percent), talentPercent: clampPercent(v.talent_percent) };
}

export function calculateFees(amount: number, settings: FeeSettings): FeeBreakdown {
  const employerFeePercent = settings.enabled ? settings.employerPercent : 0;
  const talentFeePercent = settings.enabled ? settings.talentPercent : 0;
  const employerFeeAmount = round2(amount * (employerFeePercent / 100));
  const talentFeeAmount = round2(amount * (talentFeePercent / 100));
  return {
    amount: round2(amount),
    employerFeePercent,
    employerFeeAmount,
    totalCharged: round2(amount + employerFeeAmount),
    talentFeePercent,
    talentFeeAmount,
    netAmount: round2(amount - talentFeeAmount),
    platformRevenue: round2(employerFeeAmount + talentFeeAmount),
  };
}
