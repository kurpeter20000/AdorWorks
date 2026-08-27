import { describe, expect, it } from "vitest";
import {
  EMPLOYER_ACCOUNT_ROLES,
  STAFF_ACCOUNT_ROLES,
  USER_ROLES,
  getDashboardKind,
  isEmployerAccountRole,
  isStaffAccountRole,
} from "./roles";

describe("role contracts", () => {
  it("classifies every current database role into a dashboard experience", () => {
    expect(USER_ROLES.map((role) => [role, getDashboardKind(role)])).toEqual([
      ["talent", "talent"],
      ["employer", "employer"],
      ["reviewer", "operations"],
      ["matcher", "operations"],
      ["finance", "operations"],
      ["admin", "operations"],
      ["individual_client", "employer"],
      ["org_member", "employer"],
      ["org_admin", "employer"],
      ["onboarding_agent", "assistance"],
      ["partner_hub_admin", "partner"],
    ]);
  });

  it("keeps employer and staff account groups disjoint", () => {
    expect(EMPLOYER_ACCOUNT_ROLES.every(isEmployerAccountRole)).toBe(true);
    expect(STAFF_ACCOUNT_ROLES.every(isStaffAccountRole)).toBe(true);
    expect(EMPLOYER_ACCOUNT_ROLES.some(isStaffAccountRole)).toBe(false);
    expect(STAFF_ACCOUNT_ROLES.some(isEmployerAccountRole)).toBe(false);
  });
});
