import { describe, expect, it } from "vitest";
import { getDashboardExperience } from "./navigation";

describe("dashboard navigation contract", () => {
  it("gives invited organisation roles the employer workspace", () => {
    for (const role of ["org_member", "org_admin"] as const) {
      const experience = getDashboardExperience(role);
      expect(experience.kind).toBe("employer");
      expect(experience.actions.some((action) => action.href === "/organisation")).toBe(true);
    }
  });

  it("keeps talent and employer routes separated", () => {
    const talentRoutes = getDashboardExperience("talent").actions.map((action) => action.href);
    const employerRoutes = getDashboardExperience("individual_client").actions.map((action) => action.href);

    expect(talentRoutes).toContain("/opportunities");
    expect(talentRoutes).not.toContain("/organisation");
    expect(employerRoutes).toContain("/organisation");
    expect(employerRoutes).not.toContain("/passport");
  });

  it("sends onboarding agents only to their scoped assistance workspace", () => {
    const experience = getDashboardExperience("onboarding_agent");
    expect(experience.actions).toEqual([
      {
        href: "/assist",
        label: "Assistance sessions",
        description: "Open your assigned sessions.",
        primary: true,
      },
    ]);
  });
});
