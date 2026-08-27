import { describe, expect, it } from "vitest";
import { validateE2EEnvironment, type E2EEnvironment } from "./e2e-environment";

const safeEnvironment: E2EEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: "https://adorworks-test.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SECRET_KEY: "test-secret-key",
  E2E_ALLOW_MUTATIONS: "true",
  E2E_EXPECTED_SUPABASE_PROJECT_REF: "adorworks-test",
};

describe("E2E environment safety", () => {
  it("accepts an explicitly confirmed disposable project", () => {
    expect(validateE2EEnvironment(safeEnvironment).NEXT_PUBLIC_SUPABASE_URL).toBe(
      "https://adorworks-test.supabase.co"
    );
  });

  it("fails closed without the explicit mutation opt-in", () => {
    expect(() => validateE2EEnvironment({ ...safeEnvironment, E2E_ALLOW_MUTATIONS: undefined })).toThrow(
      /E2E_ALLOW_MUTATIONS=true/
    );
  });

  it("rejects a project-reference mismatch", () => {
    expect(() =>
      validateE2EEnvironment({ ...safeEnvironment, E2E_EXPECTED_SUPABASE_PROJECT_REF: "somewhere-else" })
    ).toThrow(/expected project/);
  });

  it("refuses the known production project even with an explicit opt-in", () => {
    expect(() =>
      validateE2EEnvironment({
        ...safeEnvironment,
        NEXT_PUBLIC_SUPABASE_URL: "https://cpiebggzbxshzvlzqdfn.supabase.co",
        E2E_EXPECTED_SUPABASE_PROJECT_REF: "cpiebggzbxshzvlzqdfn",
      })
    ).toThrow(/known production/);
  });

  it("supports a deliberately confirmed local Supabase instance", () => {
    expect(
      validateE2EEnvironment({
        ...safeEnvironment,
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        E2E_EXPECTED_SUPABASE_PROJECT_REF: "local",
      }).E2E_EXPECTED_SUPABASE_PROJECT_REF
    ).toBe("local");
  });
});
