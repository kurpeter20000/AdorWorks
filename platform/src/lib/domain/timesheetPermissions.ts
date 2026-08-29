import type { ContractStatus, OrganisationMemberRole, TimesheetStatus } from "@/lib/database.types";

export type TimesheetReviewStatus = Extract<TimesheetStatus, "approved" | "rejected">;

export interface TimesheetReviewContext {
  actorUserId: string;
  talentUserId: string;
  organisationRole: OrganisationMemberRole | null;
  contractStatus: ContractStatus;
  timesheetStatus: TimesheetStatus;
}

/**
 * Shared business rule used before the privileged review write. RLS removes
 * every direct authenticated UPDATE path; this check decides whether the
 * server action may intentionally use its admin client.
 *
 * Stage 10 gap-check fix: this used to accept any organisation membership
 * at all (`hasOrganisationMembership: boolean`), so a 'viewer' member --
 * the role 0039 introduced specifically to be read-only -- could approve
 * or reject a talent's submitted hours. Now requires a write-capable role.
 */
export function canReviewTimesheet(context: TimesheetReviewContext): boolean {
  return (
    context.organisationRole !== null &&
    context.organisationRole !== "viewer" &&
    context.actorUserId !== context.talentUserId &&
    context.contractStatus === "active" &&
    context.timesheetStatus === "submitted"
  );
}
