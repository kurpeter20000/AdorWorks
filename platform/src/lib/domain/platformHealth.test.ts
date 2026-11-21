import { describe, it, expect } from "vitest";
import { change, median, hasVaguePay } from "./platformHealth";

describe("platform health helpers", () => {
  it("describes week-on-week change", () => {
    expect(change(12, 10)).toEqual({ text: "+20% vs last week", direction: "up" });
    expect(change(5, 10)).toEqual({ text: "−50% vs last week", direction: "down" });
    expect(change(3, 0)).toEqual({ text: "+3 vs last week", direction: "up" });
    expect(change(4, 4).direction).toBe("flat");
  });
  it("finds the median", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("flags negotiable or missing pay", () => {
    const base = { payment_basis: "fixed", compensation_amount: null, compensation_min: null, compensation_max: null };
    expect(hasVaguePay({ ...base, compensation_amount: 100 })).toBe(false);
    expect(hasVaguePay({ ...base, compensation_min: 100, compensation_max: 200 })).toBe(false);
    expect(hasVaguePay({ ...base, payment_basis: "negotiable", compensation_amount: 100 })).toBe(true);
    expect(hasVaguePay(base)).toBe(true);
  });
});
