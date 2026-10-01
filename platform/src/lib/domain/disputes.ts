import { msg } from "@/i18n/config";

/** 0097 — how a dispute ended. Shown to both parties and counted (never detailed) on public track records. */
export const DISPUTE_OUTCOMES = ["talent_favour", "employer_favour", "mutual_agreement", "unresolved"] as const;
export type DisputeOutcome = (typeof DISPUTE_OUTCOMES)[number];

export const DISPUTE_OUTCOME_LABEL: Record<DisputeOutcome, string> = {
  talent_favour: msg("Resolved in the talent's favour"),
  employer_favour: msg("Resolved in the employer's favour"),
  mutual_agreement: msg("Settled by agreement"),
  unresolved: msg("Closed without resolution"),
};
