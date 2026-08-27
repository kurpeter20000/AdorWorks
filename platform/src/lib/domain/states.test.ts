import { describe, expect, it } from "vitest";
import {
  APPLICATION_STATES,
  CONTRACT_STATES,
  MILESTONE_STATES,
  OFFER_STATES,
  OPPORTUNITY_STATES,
  ORGANISATION_VERIFICATION_STATES,
} from "./states";

describe("state contracts", () => {
  it("covers every current database state exactly once", () => {
    expect(Object.keys(APPLICATION_STATES)).toEqual([
      "submitted",
      "shortlisted",
      "interviewing",
      "offered",
      "accepted",
      "rejected",
      "withdrawn",
    ]);
    expect(Object.keys(OPPORTUNITY_STATES)).toEqual([
      "draft",
      "pending_review",
      "open",
      "filled",
      "closed",
      "cancelled",
      "rejected",
    ]);
    expect(Object.keys(OFFER_STATES)).toEqual(["draft", "sent", "accepted", "declined", "withdrawn"]);
    expect(Object.keys(CONTRACT_STATES)).toEqual(["active", "completed", "cancelled", "disputed"]);
    expect(Object.keys(MILESTONE_STATES)).toEqual([
      "pending",
      "submitted",
      "approved",
      "revision_requested",
      "paid",
    ]);
    expect(Object.keys(ORGANISATION_VERIFICATION_STATES)).toEqual([
      "pending",
      "verified",
      "rejected",
      "suspended",
    ]);
  });

  it("marks only genuinely final states as terminal", () => {
    expect(APPLICATION_STATES.accepted.terminal).toBe(true);
    expect("terminal" in OPPORTUNITY_STATES.open).toBe(false);
    expect("terminal" in CONTRACT_STATES.disputed).toBe(false);
    expect(MILESTONE_STATES.paid.terminal).toBe(true);
  });
});
