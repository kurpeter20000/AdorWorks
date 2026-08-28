import { describe, expect, it } from "vitest";
import { getTalentReadiness, getEmployerReadiness } from "./readiness";

describe("talent readiness", () => {
  const completeProfile = {
    headline: "Illustrator",
    bio: "I draw things.",
    skills: ["illustration"],
    category: "creative_media" as const,
    location: "Juba",
    avatar_path: "abc/def.png",
    verification_tier: "registered" as const,
    public_visible: false,
    safety_orientation_completed_at: "2026-01-01T00:00:00.000Z",
  };

  it("lists every missing field, in a stable order", () => {
    const result = getTalentReadiness({
      headline: null,
      bio: null,
      skills: [],
      category: null,
      location: null,
      avatar_path: null,
      verification_tier: "registered",
      public_visible: false,
      safety_orientation_completed_at: null,
    });
    expect(result.readiness.complete).toBe(false);
    expect(result.readiness.missing).toEqual([
      "Add a headline",
      "Add a short bio",
      "Add at least one skill",
      "Choose a category",
      "Add your location",
      "Add a profile photo",
      "Complete the free Trust & Safety orientation",
    ]);
  });

  it("is complete once every field is present, independent of verification/visibility", () => {
    const result = getTalentReadiness(completeProfile);
    expect(result.readiness.complete).toBe(true);
    expect(result.readiness.missing).toEqual([]);
  });

  it("keeps readiness, trust, and visibility as three independent signals", () => {
    const result = getTalentReadiness(completeProfile);
    // Complete profile, lowest tier, not yet visible — none of these three
    // should be conflated into one score.
    expect(result.readiness.complete).toBe(true);
    expect(result.trust.label).toBe("Registered");
    expect(result.visibility.visible).toBe(false);
    expect(result.visibility.reason).toMatch(/staff review it/);
  });

  it("gives a different visibility reason when the profile itself is incomplete", () => {
    const result = getTalentReadiness({ ...completeProfile, headline: null });
    expect(result.visibility.reason).toMatch(/Finish your profile first/);
  });

  it("never explains a reason for a profile that is already visible", () => {
    const result = getTalentReadiness({ ...completeProfile, public_visible: true });
    expect(result.visibility.visible).toBe(true);
    expect(result.visibility.reason).toBeNull();
  });
});

describe("employer readiness", () => {
  const completeOrg = {
    sector: "NGO",
    website: "https://example.org",
    billing_email: "billing@example.org",
    registration_evidence_path: "orgs/abc/reg.pdf",
    verification_status: "verified" as const,
  };

  it("requires a first posted opportunity even with a complete profile", () => {
    const result = getEmployerReadiness(completeOrg, false);
    expect(result.readiness.complete).toBe(false);
    expect(result.readiness.missing).toEqual(["Post your first opportunity"]);
  });

  it("is complete once the profile is filled in and an opportunity is posted", () => {
    const result = getEmployerReadiness(completeOrg, true);
    expect(result.readiness.complete).toBe(true);
  });

  it("visibility tracks verification_status, not profile completeness", () => {
    const unverified = getEmployerReadiness({ ...completeOrg, verification_status: "pending" }, true);
    expect(unverified.visibility.visible).toBe(false);
    expect(unverified.visibility.reason).toMatch(/only go live once/);
  });
});
