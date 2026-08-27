import type {
  ApplicationStage,
  ContractStatus,
  MilestoneStatus,
  OfferStatus,
  OpportunityStatus,
  OrganisationRow,
} from "@/lib/database.types";

export type StatusTone = "neutral" | "info" | "warning" | "success" | "danger";

export interface StateDefinition {
  label: string;
  tone: StatusTone;
  terminal?: boolean;
}

export const APPLICATION_STATES = {
  submitted: { label: "Submitted", tone: "neutral" },
  shortlisted: { label: "Shortlisted", tone: "info" },
  interviewing: { label: "Interviewing", tone: "info" },
  offered: { label: "Offer sent", tone: "warning" },
  accepted: { label: "Accepted", tone: "success", terminal: true },
  rejected: { label: "Not selected", tone: "neutral", terminal: true },
  withdrawn: { label: "Withdrawn", tone: "neutral", terminal: true },
} as const satisfies Record<ApplicationStage, StateDefinition>;

export const OPPORTUNITY_STATES = {
  draft: { label: "Draft", tone: "neutral" },
  pending_review: { label: "Submitted for review", tone: "warning" },
  open: { label: "Published", tone: "success" },
  filled: { label: "Filled", tone: "info", terminal: true },
  closed: { label: "Closed", tone: "neutral", terminal: true },
  cancelled: { label: "Cancelled", tone: "neutral", terminal: true },
  rejected: { label: "Not approved", tone: "danger", terminal: true },
} as const satisfies Record<OpportunityStatus, StateDefinition>;

export const OFFER_STATES = {
  draft: { label: "Draft", tone: "neutral" },
  sent: { label: "Awaiting response", tone: "info" },
  accepted: { label: "Accepted", tone: "success", terminal: true },
  declined: { label: "Declined", tone: "neutral", terminal: true },
  withdrawn: { label: "Withdrawn", tone: "neutral", terminal: true },
} as const satisfies Record<OfferStatus, StateDefinition>;

export const CONTRACT_STATES = {
  active: { label: "Active", tone: "success" },
  completed: { label: "Completed", tone: "info", terminal: true },
  cancelled: { label: "Cancelled", tone: "neutral", terminal: true },
  disputed: { label: "Disputed", tone: "danger" },
} as const satisfies Record<ContractStatus, StateDefinition>;

export const MILESTONE_STATES = {
  pending: { label: "Not started", tone: "neutral" },
  submitted: { label: "Awaiting review", tone: "info" },
  approved: { label: "Approved — ready for payment", tone: "warning" },
  revision_requested: { label: "Revision requested", tone: "danger" },
  paid: { label: "Paid", tone: "success", terminal: true },
} as const satisfies Record<MilestoneStatus, StateDefinition>;

type OrganisationVerificationStatus = OrganisationRow["verification_status"];

export const ORGANISATION_VERIFICATION_STATES = {
  pending: { label: "Pending verification", tone: "warning" },
  verified: { label: "Verified", tone: "success" },
  rejected: { label: "Not verified", tone: "danger", terminal: true },
  suspended: { label: "Suspended", tone: "danger" },
} as const satisfies Record<OrganisationVerificationStatus, StateDefinition>;
