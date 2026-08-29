import { describe, expect, it } from "vitest";
import { canReviewTimesheet, type TimesheetReviewContext } from "./timesheetPermissions";

const validContext: TimesheetReviewContext = {
  actorUserId: "employer-user",
  talentUserId: "talent-user",
  organisationRole: "admin",
  contractStatus: "active",
  timesheetStatus: "submitted",
};

describe("timesheet review permission", () => {
  it("allows an organisation member to review a submitted timesheet on an active contract", () => {
    expect(canReviewTimesheet(validContext)).toBe(true);
  });

  it("prevents talent from approving their own timesheet", () => {
    expect(canReviewTimesheet({ ...validContext, actorUserId: validContext.talentUserId })).toBe(false);
  });

  it("prevents cross-organisation review (no membership at all)", () => {
    expect(canReviewTimesheet({ ...validContext, organisationRole: null })).toBe(false);
  });

  // Stage 10 gap-check: this used to only check hasOrganisationMembership,
  // so a read-only 'viewer' member (introduced by 0039 specifically to be
  // read-only) could approve/reject a talent's hours. Regression test.
  it("prevents a read-only 'viewer' org member from reviewing", () => {
    expect(canReviewTimesheet({ ...validContext, organisationRole: "viewer" })).toBe(false);
  });

  it("allows a non-admin write-capable role (e.g. recruiter) to review", () => {
    expect(canReviewTimesheet({ ...validContext, organisationRole: "recruiter" })).toBe(true);
  });

  it("prevents review while a contract is not active", () => {
    expect(canReviewTimesheet({ ...validContext, contractStatus: "disputed" })).toBe(false);
  });

  it("prevents a second transition after review", () => {
    expect(canReviewTimesheet({ ...validContext, timesheetStatus: "approved" })).toBe(false);
  });
});
