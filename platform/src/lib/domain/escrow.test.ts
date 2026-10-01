import { describe, expect, it } from "vitest";
import { ESCROW_OFF, disputeWindowEndsAt, parseEscrowRates, parseEscrowSettings } from "./escrow";

describe("parseEscrowSettings", () => {
  it("reads the stored shape", () => {
    expect(parseEscrowSettings({ enabled: true, dispute_window_days: 3 })).toEqual({
      enabled: true,
      disputeWindowDays: 3,
    });
  });

  it("treats anything malformed as off", () => {
    expect(parseEscrowSettings(null)).toEqual(ESCROW_OFF);
    expect(parseEscrowSettings({ enabled: "yes", dispute_window_days: "x" })).toEqual(ESCROW_OFF);
  });

  it("clamps the window to the allowed range", () => {
    expect(parseEscrowSettings({ enabled: true, dispute_window_days: 0 }).disputeWindowDays).toBe(1);
    expect(parseEscrowSettings({ enabled: true, dispute_window_days: 90 }).disputeWindowDays).toBe(30);
  });
});

describe("parseEscrowRates", () => {
  it("reads the stored rate even while switched off", () => {
    expect(parseEscrowRates({ enabled: false, dispute_window_days: 5 })).toEqual({
      enabled: false,
      disputeWindowDays: 5,
    });
  });
});

describe("disputeWindowEndsAt", () => {
  it("adds the configured number of days", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const result = disputeWindowEndsAt({ enabled: true, disputeWindowDays: 3 }, from);
    expect(result.toISOString()).toBe("2026-01-04T00:00:00.000Z");
  });
});
