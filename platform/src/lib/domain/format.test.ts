import { describe, it, expect } from "vitest";
import { compactAmount, formatCompensation } from "./format";

describe("short listing amounts", () => {
  it("uses K and M instead of long zeros", () => {
    expect(compactAmount(950)).toBe("950");
    expect(compactAmount(250000)).toBe("250K");
    expect(compactAmount(1500)).toBe("1.5K");
    expect(compactAmount(2500000)).toBe("2.5M");
    expect(compactAmount(1000000)).toBe("1M");
  });

  it("formats fixed pay and ranges", () => {
    const base = { payment_basis: null, compensation_amount: null, compensation_min: null, compensation_max: null, currency: "SSP" };
    expect(formatCompensation({ ...base, compensation_amount: 250000 })).toBe("SSP 250K");
    expect(formatCompensation({ ...base, compensation_min: 600000, compensation_max: 900000 })).toBe("SSP 600K–900K");
  });
});
