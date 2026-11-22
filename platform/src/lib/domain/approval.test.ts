import { describe, expect, it } from "vitest";
import { approvalBlock, approvalSection, isApprovalError, needsApproval } from "./approval";

describe("account approval", () => {
  it("talent and employer accounts need approval; staff roles don't", () => {
    expect(needsApproval("talent")).toBe(true);
    expect(needsApproval("individual_client")).toBe(true);
    expect(needsApproval("org_member")).toBe(true);
    expect(needsApproval("admin")).toBe(false);
    expect(needsApproval("onboarding_agent")).toBe(false);
  });

  it("routes talent to the Talent section and employers to Organisations", () => {
    expect(approvalSection("talent")).toBe("talent");
    expect(approvalSection("org_admin")).toBe("organisations");
    expect(approvalSection("verifier")).toBeNull();
  });

  it("blocks pending and declined accounts only", () => {
    expect(approvalBlock({ role: "talent", approvalStatus: "approved" })).toBeNull();
    expect(approvalBlock({ role: "talent", approvalStatus: "pending" })).toMatch(/waiting for approval/);
    expect(approvalBlock({ role: "individual_client", approvalStatus: "declined" })).toMatch(/wasn't approved/);
    expect(approvalBlock({ role: "admin", approvalStatus: "pending" })).toBeNull();
  });

  it("recognises the database's approval refusal", () => {
    expect(isApprovalError("Your account is waiting for approval by AdorWorks. You can do this once it's approved.")).toBe(true);
    expect(isApprovalError("duplicate key")).toBe(false);
  });
});
