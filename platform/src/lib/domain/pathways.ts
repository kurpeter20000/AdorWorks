import { msg } from "@/i18n/config";
import { MIN_GROUP_SIZE } from "./programmeConsent";

/**
 * Pathways cohorts and the programme partner dashboard (PATHWAYS.md,
 * competitive brief). Pure, so the privacy floor is tested: partners
 * never see a group smaller than 5, and never a name without that
 * person's consent, a signed data-sharing agreement, and (for under-18s)
 * a guardian's consent.
 */
export const PROGRAMME_TYPES = {
  career_readiness: msg("Career Readiness Workshop"),
  portfolio_studio: msg("Portfolio Studio"),
  graduate_launchpad: msg("Graduate Launchpad"),
  internship_bridge: msg("Internship Bridge"),
  train_the_trainer: msg("Train-the-Trainer"),
  hiring_young_people: msg("Hiring Young People Well"),
  other: msg("Other programme"),
} as const;
export type ProgrammeType = keyof typeof PROGRAMME_TYPES;

/** e.g. "EDU-7KQ4": short enough to write on a whiteboard, no look-alike characters. */
export function newJoinCode(prefix: string, randomIndex: (max: number) => number): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const clean = prefix.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) || "AW";
  let code = "";
  for (let i = 0; i < 4; i++) code += alphabet[randomIndex(alphabet.length)];
  return `${clean}-${code}`;
}

export interface ParticipantFacts {
  talentId: string;
  name: string;
  isMinor: boolean;
  joinedAt: string;
  tier: string;
  passportComplete: boolean;
  portfolioReviewed: boolean;
  location: string | null;
  category: string | null;
  matched: boolean;
  placed: boolean;
  firstPaidAt: string | null;
  earnings: Record<string, number>;
  /** Newest consent choice, if any. */
  consent: { named: boolean; earnings: boolean; story: boolean; guardian: string | null } | null;
}

export const FUNNEL_STEPS = [
  { key: "enrolled", label: msg("Enrolled") },
  { key: "identity", label: msg("Identity verified") },
  { key: "adorverified", label: msg("AdorVerified") },
  { key: "matched", label: msg("Matched to work") },
  { key: "placed", label: msg("Placed") },
  { key: "paid", label: msg("Paid") },
] as const;

const TIER_RANK: Record<string, number> = { registered: 0, identity_verified: 1, adorverified: 2, adorcertified: 3, team_lead: 4 };

export interface PartnerReport {
  /** False when the cohort is under 5 people: nothing else is shown. */
  visible: boolean;
  members: number;
  funnel: { key: string; label: string; count: number }[];
  placed: number;
  earnings: Record<string, number>;
  medianDaysToFirstPay: number | null;
  breakdown: { by: "category" | "location"; rows: { value: string; count: number }[] }[];
  storiesAgreed: number;
  named: { talentId: string; name: string; tier: string; placed: boolean; paid: boolean; earnings: Record<string, number> | null }[];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** Groups under the floor are folded into "Other" (and "Other" itself is dropped if still too small). */
function groupCounts(values: (string | null)[]): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v?.trim() || "Not given", (counts.get(v?.trim() || "Not given") ?? 0) + 1);
  const rows: { value: string; count: number }[] = [];
  let other = 0;
  for (const [value, count] of counts) {
    if (count >= MIN_GROUP_SIZE) rows.push({ value, count });
    else other += count;
  }
  if (other >= MIN_GROUP_SIZE) rows.push({ value: "Other", count: other });
  return rows.sort((a, b) => b.count - a.count);
}

export function buildPartnerReport(people: ParticipantFacts[], agreementSigned: boolean): PartnerReport {
  const members = people.length;
  const empty: PartnerReport = { visible: false, members, funnel: [], placed: 0, earnings: {}, medianDaysToFirstPay: null, breakdown: [], storiesAgreed: 0, named: [] };
  if (members < MIN_GROUP_SIZE) return empty;

  const count = (f: (p: ParticipantFacts) => boolean) => people.filter(f).length;
  const funnelCounts: Record<string, number> = {
    enrolled: members,
    identity: count((p) => (TIER_RANK[p.tier] ?? 0) >= 1),
    adorverified: count((p) => (TIER_RANK[p.tier] ?? 0) >= 2),
    matched: count((p) => p.matched || p.placed),
    placed: count((p) => p.placed),
    paid: count((p) => p.firstPaidAt !== null),
  };
  const earnings: Record<string, number> = {};
  for (const p of people) for (const [c, v] of Object.entries(p.earnings)) earnings[c] = Math.round(((earnings[c] ?? 0) + v) * 100) / 100;
  const days = people
    .filter((p) => p.firstPaidAt)
    .map((p) => Math.max(0, Math.round((Date.parse(p.firstPaidAt!) - Date.parse(p.joinedAt)) / 86400000)));

  const canName = (p: ParticipantFacts) => agreementSigned && !!p.consent?.named && (!p.isMinor || !!p.consent.guardian);

  return {
    visible: true,
    members,
    funnel: FUNNEL_STEPS.map((s) => ({ key: s.key, label: s.label, count: funnelCounts[s.key] })),
    placed: funnelCounts.placed,
    earnings,
    // A median over fewer than 5 people could point at one person.
    medianDaysToFirstPay: days.length >= MIN_GROUP_SIZE ? median(days) : null,
    breakdown: [
      { by: "category", rows: groupCounts(people.map((p) => p.category)) },
      { by: "location", rows: groupCounts(people.map((p) => p.location)) },
    ],
    storiesAgreed: count((p) => canName(p) && !!p.consent?.story),
    named: people.filter(canName).map((p) => ({
      talentId: p.talentId,
      name: p.name,
      tier: p.tier,
      placed: p.placed,
      paid: p.firstPaidAt !== null,
      earnings: p.consent?.earnings ? p.earnings : null,
    })),
  };
}

/** Progress checklist per participant (PATHWAYS.md): Passport → portfolio → assessment → internship → first paid work. */
export function participantProgress(p: Pick<ParticipantFacts, "passportComplete" | "portfolioReviewed" | "tier" | "placed" | "firstPaidAt">) {
  return [
    { key: "passport", label: msg("Passport complete"), done: p.passportComplete },
    { key: "portfolio", label: msg("Portfolio reviewed"), done: p.portfolioReviewed },
    { key: "assessment", label: msg("Assessment passed (AdorVerified)"), done: (TIER_RANK[p.tier] ?? 0) >= 2 },
    { key: "placement", label: msg("Internship or placement"), done: p.placed },
    { key: "paid", label: msg("First paid work"), done: p.firstPaidAt !== null },
  ];
}

/** A short check code for an exported report, so a donor can ask AdorWorks to confirm it's genuine. */
export function reportCheckCode(hashHex: string): string {
  return hashHex.slice(0, 12).toUpperCase().replace(/(.{4})(?=.)/g, "$1-");
}
