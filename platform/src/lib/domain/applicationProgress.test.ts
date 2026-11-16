import { describe, it, expect } from "vitest";
import { applicationProgress } from "./applicationProgress";

const NOW = Date.parse("2026-11-16T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

describe("application progress", () => {
  it("a new application sits on Applied and says how long the employer has", () => {
    const p = applicationProgress({ stage: "submitted", viewedAt: null, stageChangedAt: daysAgo(4) }, NOW);
    expect(p.step).toBe(0);
    expect(p.vars).toEqual({ n: 10 });
  });

  it("moves to Viewed once the employer opens it", () => {
    expect(applicationProgress({ stage: "submitted", viewedAt: daysAgo(1), stageChangedAt: daysAgo(2) }, NOW).step).toBe(1);
  });

  it("explains staff review on staff-assisted roles instead of a countdown", () => {
    const p = applicationProgress({ stage: "submitted", viewedAt: null, stageChangedAt: daysAgo(2), staffAssisted: true }, NOW);
    expect(p.step).toBe(0);
    expect(p.vars).toBeUndefined();
    expect(p.next).toMatch(/staff review/);
  });

  it("never shows a negative countdown", () => {
    expect(applicationProgress({ stage: "submitted", viewedAt: null, stageChangedAt: daysAgo(20) }, NOW).vars).toEqual({ n: 0 });
  });

  it("counts down on the shortlist too, since it also closes after 14 days", () => {
    expect(applicationProgress({ stage: "shortlisted", viewedAt: null, stageChangedAt: daysAgo(10) }, NOW).vars).toEqual({ n: 4 });
  });

  it("maps later stages to Shortlisted and Offer, and closed ones to no step", () => {
    expect(applicationProgress({ stage: "shortlisted", viewedAt: null }, NOW).step).toBe(2);
    expect(applicationProgress({ stage: "interviewing", viewedAt: null }, NOW).step).toBe(2);
    expect(applicationProgress({ stage: "offered", viewedAt: null }, NOW).step).toBe(3);
    expect(applicationProgress({ stage: "accepted", viewedAt: null }, NOW).step).toBe(3);
    expect(applicationProgress({ stage: "rejected", viewedAt: null }, NOW).step).toBeNull();
    expect(applicationProgress({ stage: "withdrawn", viewedAt: null }, NOW).step).toBeNull();
  });
});
