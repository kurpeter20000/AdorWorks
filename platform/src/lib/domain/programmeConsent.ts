import { msg } from "@/i18n/config";

/**
 * Programme-partner consent (PAYMENTS-FEES-GUARANTEE-CONSENT §4; owner
 * decisions 2026-11-21: 24 months, groups under 5 never shown, guardian
 * consent for under-18s recorded by staff, translations checked by a
 * person before going live). Switched off until approved
 * (platform_settings 'programme_sharing').
 *
 * The wording version is stored with every choice, so when counsel
 * changes the text, bump this and people are asked again.
 */
export const CONSENT_WORDING_VERSION = "draft-2026-11-21";
export const RETENTION_MONTHS = 24;
export const MIN_GROUP_SIZE = 5;
/** Owner decision (2026-11-21): AdorWorks is the named party; registration to follow in Juba. */
export const COMPANY_NAME = "AdorWorks";

export const CONSENT_BOXES = {
  share_named_progress: msg("My progress with my name: verification level, jobs I was placed in, and whether I was paid on time."),
  share_earnings: msg("How much I earned through AdorWorks during the programme."),
  share_story: msg("My story, if I agree to it later, to use in reports."),
} as const;
export type ConsentBox = keyof typeof CONSENT_BOXES;

export interface ConsentChoice {
  share_named_progress: boolean;
  share_earnings: boolean;
  share_story: boolean;
}

export const NO_CONSENT: ConsentChoice = { share_named_progress: false, share_earnings: false, share_story: false };

/** Earnings without named progress makes no sense to share alone — keep the choices consistent. */
export function normaliseConsent(c: ConsentChoice): ConsentChoice {
  return { ...c, share_earnings: c.share_named_progress && c.share_earnings };
}
