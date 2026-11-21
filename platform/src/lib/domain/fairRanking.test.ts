/**
 * Spec "Fair-ranking check: confirms ranking uses skill overlap only".
 * This runs on every release: recommendations must not move because of
 * pay, the employer's verification, or anything else but skill overlap
 * (newest first only breaks ties).
 */
import { describe, it, expect } from "vitest";
import { rankBySkillOverlap } from "./matching";

const opp = (id: string, skills: string[], extra: Record<string, unknown> = {}) => ({ id, skills, created_at: "2026-11-01T00:00:00Z", ...extra });

describe("fair ranking", () => {
  it("ranks by skill overlap, never by pay or reputation", () => {
    const ranked = rankBySkillOverlap(
      [
        opp("high-pay-low-match", ["excel"], { compensation_amount: 9_000_000, verified: true }),
        opp("low-pay-high-match", ["branding", "layout", "canva"], { compensation_amount: 10, verified: false }),
        opp("mid", ["branding"], { compensation_amount: 500_000 }),
      ],
      ["branding", "layout", "canva"]
    );
    expect(ranked.map((o) => o.id)).toEqual(["low-pay-high-match", "mid", "high-pay-low-match"]);
  });

  it("changing pay never changes the order", () => {
    const base = [opp("a", ["x", "y"]), opp("b", ["x"]), opp("c", [])];
    const withPay = base.map((o, i) => ({ ...o, compensation_amount: [1, 1_000_000, 50_000_000][i] }));
    expect(rankBySkillOverlap(withPay, ["x", "y"]).map((o) => o.id)).toEqual(rankBySkillOverlap(base, ["x", "y"]).map((o) => o.id));
  });
});
