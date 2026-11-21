import { describe, it, expect } from "vitest";
import { fitCheck } from "./fitCheck";

describe("Fit check", () => {
  it("labels by the share of asked skills on the Passport", () => {
    expect(fitCheck(["Figma", "Canva", "Photoshop"], ["figma", "canva", "photoshop", "Excel"])?.level).toBe("good");
    expect(fitCheck(["Figma", "Canva", "Photoshop", "Illustrator", "Motion"], ["Figma", "Canva"])?.level).toBe("stretch");
    expect(fitCheck(["Figma", "Canva", "Photoshop"], ["Excel"])?.level).toBe("not_yet");
  });

  it("lists what the talent has and lacks, ignoring case and duplicates", () => {
    const f = fitCheck(["Figma", "figma ", "Canva"], ["FIGMA"])!;
    expect(f.have).toEqual(["Figma"]);
    expect(f.lack).toEqual(["Canva"]);
    expect(f.total).toBe(2);
  });

  it("has nothing to say when the job lists no skills", () => {
    expect(fitCheck([], ["Figma"])).toBeNull();
    expect(fitCheck(null, null)).toBeNull();
  });
});
