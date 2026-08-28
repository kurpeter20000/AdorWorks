/**
 * Fixed scorecard criteria (0051) — shared constant, not defined in
 * lib/actions/scorecards.ts, because a "use server" file may only export
 * async functions; a plain const/type export there breaks the build.
 */
export const SCORECARD_CRITERIA = ["skill_fit", "communication", "portfolio_quality", "reliability"] as const;
export type ScorecardCriterion = (typeof SCORECARD_CRITERIA)[number];
