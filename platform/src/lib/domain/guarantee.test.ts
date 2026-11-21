import { describe, it, expect } from "vitest";
import { guaranteeWindowDays, guaranteeWindowEnds, parseGuaranteeEnabled } from "./guarantee";
import { normaliseConsent } from "./programmeConsent";

describe("Employer Guarantee", () => {
  it("covers full-time hires for 90 days and everything else for 30", () => {
    expect(guaranteeWindowDays("full_time")).toBe(90);
    expect(guaranteeWindowDays("freelance")).toBe(30);
    expect(guaranteeWindowDays(null)).toBe(30);
    expect(guaranteeWindowEnds("2026-11-01T00:00:00Z", "fixed_term_contract").toISOString().slice(0, 10)).toBe("2026-12-01");
  });

  it("is off unless explicitly switched on", () => {
    expect(parseGuaranteeEnabled(null)).toBe(false);
    expect(parseGuaranteeEnabled({ enabled: "yes" })).toBe(false);
    expect(parseGuaranteeEnabled({ enabled: true })).toBe(true);
  });
});

describe("programme consent", () => {
  it("never shares earnings without named progress", () => {
    expect(normaliseConsent({ share_named_progress: false, share_earnings: true, share_story: false }).share_earnings).toBe(false);
    expect(normaliseConsent({ share_named_progress: true, share_earnings: true, share_story: false }).share_earnings).toBe(true);
  });
});
