import type { ApplicationStage } from "@/lib/database.types";
import { msg } from "@/i18n/config";

/**
 * Where an application stands, in the spec's plain words:
 * Applied → Viewed → Shortlisted → Offer, plus one line saying what
 * happens next. Shared by the talent home screen and /applications so
 * the two never disagree.
 */
export const APPLICATION_STEPS = [msg("Applied"), msg("Viewed"), msg("Shortlisted"), msg("Offer")] as const;

/** The 0110 rule: no employer action for this long closes the application. */
export const NO_GHOSTING_DAYS = 14;
const DAY = 86_400_000;

export interface ProgressInput {
  stage: ApplicationStage;
  viewedAt: string | null;
  /** When the stage last changed — the 14-day clock (0110). */
  stageChangedAt?: string | null;
  /** Staff review applications first on staff-assisted opportunities. */
  staffAssisted?: boolean;
}

export interface Progress {
  /** Index into APPLICATION_STEPS; null when the application is closed. */
  step: number | null;
  /** What happens next, as an untranslated message key. */
  next: string;
  /** Values for the message's {placeholders}. */
  vars?: Record<string, string | number>;
  /** Where the next step happens, when it's somewhere else. */
  href?: string;
}

export function applicationProgress(a: ProgressInput, now: number): Progress {
  const daysLeft = a.stageChangedAt ? Math.max(0, Math.ceil((Date.parse(a.stageChangedAt) + NO_GHOSTING_DAYS * DAY - now) / DAY)) : null;
  switch (a.stage) {
    case "submitted":
      if (a.staffAssisted) {
        return { step: 0, next: msg("AdorWorks staff review applications for this role first, then share a shortlist with the employer.") };
      }
      if (a.viewedAt) {
        return daysLeft !== null
          ? { step: 1, next: msg("The employer has seen your application. They have {n} days left to respond, or it closes and you'll be told."), vars: { n: daysLeft } }
          : { step: 1, next: msg("The employer has seen your application.") };
      }
      return daysLeft !== null
        ? { step: 0, next: msg("Waiting for the employer to open it. If nobody responds in {n} days, it closes and you'll be told."), vars: { n: daysLeft } }
        : { step: 0, next: msg("Waiting for the employer to open it.") };
    case "shortlisted":
      return daysLeft !== null
        ? { step: 2, next: msg("You're on the shortlist. The employer has {n} days to invite you to an interview or make an offer, or it closes and you'll be told."), vars: { n: daysLeft } }
        : { step: 2, next: msg("You're on the shortlist. The employer may invite you to an interview or make you an offer.") };
    case "interviewing":
      return { step: 2, next: msg("You're in the interview stage. Check the interview details in your messages.") };
    case "offered":
      return { step: 3, next: msg("You have an offer. Read it and respond on the Offers page."), href: "/offers" };
    case "accepted":
      return { step: 3, next: msg("You were hired. Your contract is under Contracts."), href: "/contracts" };
    case "withdrawn":
      return { step: null, next: msg("You withdrew this application.") };
    case "rejected":
    default:
      return { step: null, next: msg("This application is closed.") };
  }
}
