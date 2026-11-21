import { msg } from "@/i18n/config";
import type { EngagementType } from "@/lib/database.types";

/**
 * Employer Guarantee (draft terms, PAYMENTS-FEES-GUARANTEE-CONSENT §3;
 * owner decisions 2026-11-21). Built but switched off until counsel
 * approves the wording (platform_settings 'guarantee').
 *
 * Windows: full-time hires are covered during probation, up to 90 days
 * from the start; contract talent, projects and services for 30 days.
 * One replacement per role. While fees are 0% (pilot) the remedy is a free
 * replacement only; once fees are on, a fee CREDIT (never a refund) if no
 * suitable shortlist is found within 30 days. Workers never pay any part.
 */
export const GUARANTEE_TERMS_VERSION = "draft-2026-11-21";

export function guaranteeWindowDays(engagementType: EngagementType | null | undefined): number {
  return engagementType === "full_time" ? 90 : 30;
}

export function guaranteeWindowEnds(startedAt: string, engagementType: EngagementType | null | undefined): Date {
  const d = new Date(startedAt);
  d.setDate(d.getDate() + guaranteeWindowDays(engagementType));
  return d;
}

export function parseGuaranteeEnabled(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && (value as Record<string, unknown>).enabled === true);
}

export const GUARANTEE_REASONS = {
  scope_missed: msg("The work didn't match the agreed scope"),
  left_early: msg("The person left or the placement ended early"),
  skills_missing: msg("Skills we were told they had turned out to be missing"),
  other: msg("Something else covered by the Guarantee"),
} as const;
export type GuaranteeReason = keyof typeof GUARANTEE_REASONS;

export const GUARANTEE_STATUS_LABEL: Record<string, string> = {
  open: msg("Received — AdorWorks is looking into it"),
  replacement_sent: msg("New shortlist sent"),
  credited: msg("Fee credit applied"),
  declined: msg("Not covered — see the note from AdorWorks"),
  closed: msg("Closed"),
};

/** What the employer is promised right now, given whether fees are being charged. */
export function guaranteeRemedy(feesEnabled: boolean): string {
  return feesEnabled
    ? msg("A new shortlist within 10 business days at no extra fee. If no suitable shortlist is found within 30 days, a full credit of the AdorWorks fee.")
    : msg("A new shortlist within 10 business days, free of charge.");
}
