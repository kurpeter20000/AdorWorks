import { describe, it, expect } from "vitest";
import { adorCertifiedSteps } from "./adorCertified";

describe("AdorCertified progress", () => {
  it("starts at nothing done; courses never count yet", () => {
    const r = adorCertifiedSteps({ tier: "registered", approvedEvidenceTypes: [] });
    expect([r.done, r.total]).toEqual([0, 3]);
    expect(r.steps.find((s) => s.key === "courses")?.state).toBe("later");
  });
  it("counts identity and recorded documents", () => {
    expect(adorCertifiedSteps({ tier: "identity_verified", approvedEvidenceTypes: ["identity", "reference"] }).done).toBe(2);
    expect(adorCertifiedSteps({ tier: "registered", approvedEvidenceTypes: ["reference"] }).done).toBe(0);
  });
  it("is complete once staff confirm the tier", () => {
    expect(adorCertifiedSteps({ tier: "adorcertified", approvedEvidenceTypes: ["identity", "portfolio"] }).done).toBe(3);
  });
});
