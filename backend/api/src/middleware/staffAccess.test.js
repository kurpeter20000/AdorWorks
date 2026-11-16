import { describe, it, expect } from "vitest";
import { requireStaffArea, STAFF_API_ACCESS, STAFF_ROLES } from "./staffAccess.js";

function call(area, role, method = "GET") {
  let status = 200;
  let nextCalled = false;
  const res = { status(s) { status = s; return this; }, json() { return this; } };
  requireStaffArea(area)({ method, user: role ? { role } : undefined }, res, () => { nextCalled = true; });
  return nextCalled ? 200 : status;
}

describe("staff areas (Phase B2)", () => {
  it("lets admin into every area, for reading and writing", () => {
    for (const area of Object.keys(STAFF_API_ACCESS)) {
      expect(call(area, "admin", "GET")).toBe(200);
      expect(call(area, "admin", "POST")).toBe(200);
    }
  });

  it("gives each role its own queues", () => {
    expect(call("organisations", "verifier", "PATCH")).toBe(200);
    expect(call("talent", "verifier", "POST")).toBe(200);
    expect(call("reports", "trust_safety", "PATCH")).toBe(200);
    expect(call("disputes", "trust_safety", "PATCH")).toBe(200);
    expect(call("assistedOnboarding", "field_support", "POST")).toBe(200);
    expect(call("opportunities", "reviewer", "POST")).toBe(200);
    expect(call("applications", "matcher", "POST")).toBe(200);
  });

  it("keeps roles out of other roles' work", () => {
    expect(call("opportunities", "verifier", "POST")).toBe(403);
    expect(call("organisations", "reviewer", "PATCH")).toBe(403);
    expect(call("reports", "finance", "GET")).toBe(403);
    expect(call("assistedOnboarding", "reviewer", "GET")).toBe(403);
    expect(call("intake", "field_support", "GET")).toBe(403);
  });

  it("lets a matcher look up talent and organisations to build a shortlist, but not verify them", () => {
    expect(call("talent", "matcher", "GET")).toBe(200);
    expect(call("talent", "matcher", "POST")).toBe(403);
    expect(call("organisations", "matcher", "GET")).toBe(200);
    expect(call("organisations", "matcher", "PATCH")).toBe(403);
    expect(call("opportunities", "matcher", "POST")).toBe(403);
  });

  it("refuses requests without a signed-in staff member", () => {
    expect(call("talent", undefined)).toBe(403);
  });

  it("only names real staff roles", () => {
    for (const { read, write } of Object.values(STAFF_API_ACCESS)) {
      for (const role of [...read, ...write]) expect(STAFF_ROLES.has(role)).toBe(true);
    }
  });
});
