import { describe, expect, it } from "vitest";
import { canReviewTimesheet, type TimesheetReviewContext } from "./timesheetPermissions";

const validContext: TimesheetReviewContext = {
  actorUserId: "employer-user",
  talentUserId: "talent-user",
  hasOrganisationMembership: true,
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

  it("prevents cross-organisation review", () => {
    expect(canReviewTimesheet({ ...validContext, hasOrganisationMembership: false })).toBe(false);
  });

  it("prevents review while a contract is not active", () => {
    expect(canReviewTimesheet({ ...validContext, contractStatus: "disputed" })).toBe(false);
  });

  it("prevents a second transition after review", () => {
    expect(canReviewTimesheet({ ...validContext, timesheetStatus: "approved" })).toBe(false);
  });
});
