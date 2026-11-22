import { msg } from "@/i18n/config";

/**
 * Channel names the platform creates itself (0127) are translated; names
 * people type for their own channels are shown as written.
 */
const BUILT_IN: Record<string, string> = {
  Team: msg("Team"),
  General: msg("General"),
  "Talent & verification": msg("Talent & verification"),
  "Employers & jobs": msg("Employers & jobs"),
  "Payments & finance": msg("Payments & finance"),
  Pathways: msg("Pathways"),
  "Cohort chat": msg("Cohort chat"),
  "Team chat": msg("Team chat"),
  "Your team": msg("Your team"),
  Candidates: msg("Candidates"),
  "AdorWorks staff": msg("AdorWorks staff"),
  "Your organisation's people only": msg("Your organisation's people only"),
  "Everyone at AdorWorks": msg("Everyone at AdorWorks"),
  "Evidence, tiers and talent questions": msg("Evidence, tiers and talent questions"),
  "Organisations, briefs and shortlists": msg("Organisations, briefs and shortlists"),
  "Payouts, invoices and reconciliation": msg("Payouts, invoices and reconciliation"),
  "Cohorts, partners and sessions": msg("Cohorts, partners and sessions"),
  "Participants, facilitators and staff": msg("Participants, facilitators and staff"),
  "Facilitators, partner staff and AdorWorks": msg("Facilitators, partner staff and AdorWorks"),
};

export function channelLabel(name: string, t: (s: string) => string): string {
  return BUILT_IN[name] ? t(BUILT_IN[name]) : name;
}

export function isBuiltInLabel(name: string): boolean {
  return name in BUILT_IN;
}
