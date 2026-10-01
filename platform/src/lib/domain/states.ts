import { msg } from "@/i18n/config";
import type {
  ApplicationStage,
  ContractStatus,
  MilestoneStatus,
  OfferStatus,
  OpportunityStatus,
  OrganisationRow,
  TalentServiceStatus,
} from "@/lib/database.types";

export type StatusTone = "neutral" | "info" | "warning" | "success" | "danger";

export interface StateDefinition {
  label: string;
  tone: StatusTone;
  terminal?: boolean;
}

export const APPLICATION_STATES = {
  submitted: { label: msg("Submitted"), tone: "neutral" },
  shortlisted: { label: msg("Shortlisted"), tone: "info" },
  interviewing: { label: msg("Interviewing"), tone: "info" },
  offered: { label: msg("Offer sent"), tone: "warning" },
  accepted: { label: msg("Accepted"), tone: "success", terminal: true },
  rejected: { label: msg("Not selected"), tone: "neutral", terminal: true },
  withdrawn: { label: msg("Withdrawn"), tone: "neutral", terminal: true },
} as const satisfies Record<ApplicationStage, StateDefinition>;

export const OPPORTUNITY_STATES = {
  draft: { label: msg("Draft"), tone: "neutral" },
  pending_review: { label: msg("Submitted for review"), tone: "warning" },
  open: { label: msg("Published"), tone: "success" },
  filled: { label: msg("Filled"), tone: "info", terminal: true },
  closed: { label: msg("Closed"), tone: "neutral", terminal: true },
  cancelled: { label: msg("Cancelled"), tone: "neutral", terminal: true },
  rejected: { label: msg("Not approved"), tone: "danger", terminal: true },
  changes_required: { label: msg("Changes requested"), tone: "warning" },
  paused: { label: msg("Paused"), tone: "neutral" },
  expired: { label: msg("Expired"), tone: "neutral", terminal: true },
} as const satisfies Record<OpportunityStatus, StateDefinition>;

export const TALENT_SERVICE_STATES = {
  draft: { label: msg("Draft"), tone: "neutral" },
  pending_review: { label: msg("Submitted for review"), tone: "warning" },
  published: { label: msg("Published"), tone: "success" },
  paused: { label: msg("Paused"), tone: "neutral" },
  rejected: { label: msg("Not approved"), tone: "danger" },
  removed: { label: msg("Withdrawn"), tone: "neutral", terminal: true },
} as const satisfies Record<TalentServiceStatus, StateDefinition>;

export const OFFER_STATES = {
  draft: { label: msg("Draft"), tone: "neutral" },
  sent: { label: msg("Awaiting response"), tone: "info" },
  accepted: { label: msg("Accepted"), tone: "success", terminal: true },
  declined: { label: msg("Declined"), tone: "neutral", terminal: true },
  withdrawn: { label: msg("Withdrawn"), tone: "neutral", terminal: true },
} as const satisfies Record<OfferStatus, StateDefinition>;

export const CONTRACT_STATES = {
  active: { label: msg("Active"), tone: "success" },
  completed: { label: msg("Completed"), tone: "info", terminal: true },
  cancelled: { label: msg("Cancelled"), tone: "neutral", terminal: true },
  disputed: { label: msg("Disputed"), tone: "danger" },
} as const satisfies Record<ContractStatus, StateDefinition>;

export const MILESTONE_STATES = {
  pending: { label: msg("Not started"), tone: "neutral" },
  submitted: { label: msg("Awaiting review"), tone: "info" },
  approved: { label: msg("Approved — ready for payment"), tone: "warning" },
  revision_requested: { label: msg("Revision requested"), tone: "danger" },
  paid: { label: msg("Paid"), tone: "success", terminal: true },
} as const satisfies Record<MilestoneStatus, StateDefinition>;

type OrganisationVerificationStatus = OrganisationRow["verification_status"];

export const ORGANISATION_VERIFICATION_STATES = {
  pending: { label: msg("Pending verification"), tone: "warning" },
  verified: { label: msg("Verified"), tone: "success" },
  rejected: { label: msg("Not verified"), tone: "danger", terminal: true },
  suspended: { label: msg("Suspended"), tone: "danger" },
} as const satisfies Record<OrganisationVerificationStatus, StateDefinition>;

// The two tracked dimensions behind ORGANISATION_VERIFICATION_STATES
// (0038/verification_checks) — a separate, finer-grained set of states
// than the computed headline summary above.
export type VerificationCheckStatus =
  | "not_started"
  | "information_required"
  | "submitted"
  | "under_review"
  | "verified"
  | "rejected"
  | "suspended"
  | "expired";

export const VERIFICATION_CHECK_STATES = {
  not_started: { label: msg("Not started"), tone: "neutral" },
  information_required: { label: msg("Information required"), tone: "warning" },
  submitted: { label: msg("Submitted"), tone: "info" },
  under_review: { label: msg("Under review"), tone: "info" },
  verified: { label: msg("Verified"), tone: "success", terminal: true },
  rejected: { label: msg("Not verified"), tone: "danger" },
  suspended: { label: msg("Suspended"), tone: "danger" },
  expired: { label: msg("Expired"), tone: "warning" },
} as const satisfies Record<VerificationCheckStatus, StateDefinition>;
