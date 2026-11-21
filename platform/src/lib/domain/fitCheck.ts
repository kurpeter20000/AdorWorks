import { msg } from "@/i18n/config";

/**
 * Talent Charter "Fit check" (competitive brief, P1): before applying,
 * show how well a job matches — which asked-for skills the talent has and
 * lacks — with one plain label. Uses Passport skills only, never pay,
 * reputation or who the employer is (same fairness rule as matching.ts).
 */
export type FitLevel = "good" | "stretch" | "not_yet";

export const FIT_LABEL: Record<FitLevel, string> = {
  good: msg("Good fit"),
  stretch: msg("Stretch"),
  not_yet: msg("Not yet"),
};

export const FIT_HINT: Record<FitLevel, string> = {
  good: msg("You have most of the skills this job asks for."),
  stretch: msg("You have some of the skills. Say how you'd cover the rest in your pitch."),
  not_yet: msg("You have few of the skills asked for. Build your Passport first, or apply if you have them but haven't added proof."),
};

export interface FitCheck {
  level: FitLevel;
  have: string[];
  lack: string[];
  total: number;
}

/** null when the job lists no skills (nothing to check against). */
export function fitCheck(askedSkills: string[] | null | undefined, passportSkills: string[] | null | undefined): FitCheck | null {
  // First spelling wins when the same skill is listed twice.
  const byKey = new Map<string, string>();
  for (const raw of askedSkills ?? []) {
    const s = raw.trim();
    if (s && !byKey.has(s.toLowerCase())) byKey.set(s.toLowerCase(), s);
  }
  const asked = [...byKey.values()];
  if (asked.length === 0) return null;
  const mine = new Set((passportSkills ?? []).map((s) => s.trim().toLowerCase()));
  const have = asked.filter((s) => mine.has(s.toLowerCase()));
  const lack = asked.filter((s) => !mine.has(s.toLowerCase()));
  const share = have.length / asked.length;
  const level: FitLevel = share >= 0.7 ? "good" : share >= 0.4 ? "stretch" : "not_yet";
  return { level, have, lack, total: asked.length };
}

/**
 * Talent Charter: at most 10 open applications at once — fewer, better
 * applications, and nobody spamming the queue. "Open" means still waiting
 * on a decision. Also enforced in the database (0118).
 */
export const MAX_OPEN_APPLICATIONS = 10;
export const OPEN_APPLICATION_STAGES = ["submitted", "shortlisted", "interviewing", "offered"] as const;
