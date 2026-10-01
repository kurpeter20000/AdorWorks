import { describe, expect, it } from "vitest";
import { calculateFees, parseFeeSettings, FEES_OFF } from "./fees";

describe("calculateFees", () => {
  const on = { enabled: true, employerPercent: 2.5, talentPercent: 7.5 };

  it("adds the employer fee on top and deducts the talent fee", () => {
    const f = calculateFees(10000, on);
    expect(f.employerFeeAmount).toBe(250);
    expect(f.totalCharged).toBe(10250);
    expect(f.talentFeeAmount).toBe(750);
    expect(f.netAmount).toBe(9250);
    expect(f.platformRevenue).toBe(1000);
  });

  it("charges nothing while fees are switched off, whatever the rates", () => {
    const f = calculateFees(10000, { ...on, enabled: false });
    expect(f.totalCharged).toBe(10000);
    expect(f.netAmount).toBe(10000);
    expect(f.platformRevenue).toBe(0);
    expect(f.employerFeePercent).toBe(0);
  });

  it("rounds to two decimals", () => {
    const f = calculateFees(333.33, on);
    expect(f.employerFeeAmount).toBe(8.33);
    expect(f.talentFeeAmount).toBe(25);
    expect(f.totalCharged).toBe(341.66);
  });
});

describe("parseFeeSettings", () => {
  it("reads the stored shape", () => {
    expect(parseFeeSettings({ enabled: true, employer_percent: 2.5, talent_percent: 7.5 })).toEqual({
      enabled: true,
      employerPercent: 2.5,
      talentPercent: 7.5,
    });
  });

  it("treats anything malformed as no fee", () => {
    expect(parseFeeSettings(null)).toEqual(FEES_OFF);
    expect(parseFeeSettings({ enabled: "yes", employer_percent: -4, talent_percent: "x" })).toEqual(FEES_OFF);
  });

  it("caps absurd rates", () => {
    expect(parseFeeSettings({ enabled: true, employer_percent: 90, talent_percent: 1 }).employerPercent).toBe(30);
  });
});
