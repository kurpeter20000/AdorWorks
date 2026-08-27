import type { ContractStatus, TimesheetStatus } from "@/lib/database.types";

export type TimesheetReviewStatus = Extract<TimesheetStatus, "approved" | "rejected">;

export interface TimesheetReviewContext {
  actorUserId: string;
  talentUserId: string;
  hasOrganisationMembership: boolean;
  contractStatus: ContractStatus;
  timesheetStatus: TimesheetStatus;
}

/**
 * Shared business rule used before the privileged review write. RLS removes
 * every direct authenticated UPDATE path; this check decides whether the
 * server action may intentionally use its admin client.
 */
export function canReviewTimesheet(context: TimesheetReviewContext): boolean {
  return (
    context.hasOrganisationMembership &&
    context.actorUserId !== context.talentUserId &&
    context.contractStatus === "active" &&
    context.timesheetStatus === "submitted"
  );
}
