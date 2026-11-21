import { msg } from "@/i18n/config";

/**
 * Structured two-way reviews (0121). Both sides answer three 1–5 questions
 * and "would you work together again?", worded for who is being reviewed.
 * The overall stars stay. Reviews only open once every milestone is paid
 * through AdorWorks (0097), so every score comes from real, paid work.
 */
export type ReviewerRole = "talent" | "employer";
export type ScoreKey = "score_quality" | "score_communication" | "score_timeliness";

export const SCORE_QUESTIONS: Record<ReviewerRole, Record<ScoreKey, string>> = {
  // The employer reviewing the talent.
  employer: {
    score_quality: msg("Quality of the work"),
    score_communication: msg("Communication"),
    score_timeliness: msg("Delivered on time"),
  },
  // The talent reviewing the employer.
  talent: {
    score_quality: msg("Clear brief and fair requests"),
    score_communication: msg("Communication and respect"),
    score_timeliness: msg("Approved and paid on time"),
  },
};

export const AGAIN_QUESTION: Record<ReviewerRole, string> = {
  employer: msg("Would you hire this person again?"),
  talent: msg("Would you work for this employer again?"),
};

/**
 * AdorCertified needs proof through paid work: at least one completed,
 * paid contract with an average employer rating of 4 or more. Staff still
 * confirm the tier itself.
 */
export function provenThroughPaidWork(paidContracts: number, averageRating: number | null): boolean {
  return paidContracts >= 1 && averageRating !== null && averageRating >= 4;
}
