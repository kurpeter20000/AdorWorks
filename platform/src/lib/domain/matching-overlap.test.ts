import { describe, it, expect } from "vitest";
import { countSkillOverlap } from "./matching";

describe("countSkillOverlap", () => {
  it("counts shared skills case-insensitively", () => {
    expect(countSkillOverlap(["Branding", "UI design", "Print"], ["branding", "ui DESIGN"])).toBe(2);
  });
  it("does not double-count a skill listed twice", () => {
    expect(countSkillOverlap(["branding", "Branding"], ["branding"])).toBe(1);
  });
  it("is 0 with no Passport skills", () => {
    expect(countSkillOverlap(["branding"], [])).toBe(0);
  });
});
