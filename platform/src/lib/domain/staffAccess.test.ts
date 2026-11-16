import { describe, it, expect } from "vitest";
import { canOpenStaffPath, canUseStaffArea, STAFF_AREA_ROLES, type StaffArea } from "./staffAccess";
import { STAFF_ACCOUNT_ROLES } from "./roles";
import { getDashboardExperience } from "./navigation";

describe("staff access (Phase B2)", () => {
  it("every operations menu link belongs to a known staff area", () => {
    const admin = getDashboardExperience("admin");
    for (const a of admin.actions) {
      const area = a.href.split("?")[0].split("/")[2];
      if (area) expect(Object.keys(STAFF_AREA_ROLES)).toContain(area);
    }
  });

  it("admin sees every staff area", () => {
    for (const area of Object.keys(STAFF_AREA_ROLES) as StaffArea[]) expect(canUseStaffArea("admin", area)).toBe(true);
  });

  it("every staff role has at least one area, and only staff roles are named", () => {
    for (const role of STAFF_ACCOUNT_ROLES) {
      if (role === "admin") continue;
      expect((Object.keys(STAFF_AREA_ROLES) as StaffArea[]).some((a) => canUseStaffArea(role, a))).toBe(true);
    }
    for (const roles of Object.values(STAFF_AREA_ROLES)) {
      for (const r of roles) expect(STAFF_ACCOUNT_ROLES as readonly string[]).toContain(r);
    }
  });

  it("menus show each role only its own work", () => {
    const hrefs = (role: Parameters<typeof getDashboardExperience>[0]) => getDashboardExperience(role).actions.map((a) => a.href);
    expect(hrefs("verifier")).toEqual(["/operations", "/operations/talent", "/operations/organisations"]);
    expect(hrefs("trust_safety")).toEqual(["/operations", "/operations/reports", "/operations/contracts", "/operations/support"]);
    expect(hrefs("field_support")).toEqual(["/operations", "/operations/assisted-onboarding", "/operations/support"]);
    expect(hrefs("finance")).toEqual(["/operations", "/operations/contracts", "/operations/invoices", "/operations/payouts", "/operations/settings"]);
    expect(hrefs("reviewer")).toEqual(["/operations", "/operations/intake", "/operations/opportunities", "/operations/services"]);
    expect(hrefs("matcher")).toEqual(["/operations", "/operations/opportunities", "/operations/engagements"]);
  });

  it("people management is admin-only; query strings don't change the answer", () => {
    expect(canOpenStaffPath("finance", "/operations/people")).toBe(false);
    expect(canOpenStaffPath("trust_safety", "/operations/contracts?status=disputed")).toBe(true);
    expect(canOpenStaffPath("reviewer", "/operations/payouts")).toBe(false);
    expect(canOpenStaffPath("verifier", "/operations/unknown-area")).toBe(false);
  });
});
