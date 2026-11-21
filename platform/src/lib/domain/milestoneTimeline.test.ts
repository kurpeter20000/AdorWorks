import { describe, it, expect } from "vitest";
import { milestoneTimelineStep } from "./milestoneTimeline";

describe("milestone payment timeline", () => {
  it("follows the milestone from submission to release", () => {
    expect(milestoneTimelineStep("pending", null)).toBeNull();
    expect(milestoneTimelineStep("revision_requested", null)).toBeNull();
    expect(milestoneTimelineStep("submitted", null)).toBe(0);
    expect(milestoneTimelineStep("approved", null)).toBe(1);
    expect(milestoneTimelineStep("paid", "held")).toBe(2);
    expect(milestoneTimelineStep("paid", "released")).toBe(3);
    // Escrow off: paid in, but not released until the payout is sent (0116).
    expect(milestoneTimelineStep("paid", "not_applicable")).toBe(2);
    expect(milestoneTimelineStep("paid", "not_applicable", "pending")).toBe(2);
    expect(milestoneTimelineStep("paid", "not_applicable", "succeeded")).toBe(3);
  });
});
