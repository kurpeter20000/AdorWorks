import { describe, expect, it } from "vitest";
import { resolveReturnPath, resolveSafeNextPath } from "./redirects";

describe("safe post-auth redirects", () => {
  it("accepts internal app routes", () => {
    expect(resolveSafeNextPath("/dashboard")).toBe("/dashboard");
    expect(resolveSafeNextPath("/onboarding/review?step=done")).toBe("/onboarding/review?step=done");
  });

  it("rejects external and protocol-relative redirects", () => {
    expect(resolveSafeNextPath("https://evil.example/path")).toBe("/dashboard");
    expect(resolveSafeNextPath("//evil.example/path")).toBe("/dashboard");
    expect(resolveSafeNextPath("/\\evil.example/path")).toBe("/dashboard");
    expect(resolveSafeNextPath("javascript:alert(1)")).toBe("/dashboard");
  });

  it("falls back safely when the value is missing or malformed", () => {
    expect(resolveSafeNextPath(null)).toBe("/dashboard");
    expect(resolveSafeNextPath(" ")).toBe("/dashboard");
    expect(resolveSafeNextPath("dashboard")).toBe("/dashboard");
  });
});

describe("return-after-sign-in paths", () => {
  it("keeps the page someone was trying to reach", () => {
    expect(resolveReturnPath("/opportunities/abc/apply")).toBe("/opportunities/abc/apply");
    expect(resolveReturnPath("/jobs/abc?ref=whatsapp")).toBe("/jobs/abc?ref=whatsapp");
  });

  it("never returns to sign-in pages, the default dashboard, or anywhere unsafe", () => {
    for (const path of ["/login", "/signup?intent=talent", "/auth/callback", "/reset-password", "/onboarding/review", "/dashboard", "//evil.example", null]) {
      expect(resolveReturnPath(path)).toBeNull();
    }
  });
});
