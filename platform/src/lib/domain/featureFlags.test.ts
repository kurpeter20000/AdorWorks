import { describe, expect, it } from "vitest";
import { FEATURE_FLAGS, featureFlagEnvironmentKey, isFeatureEnabled } from "./featureFlags";

describe("feature flag contract", () => {
  it("defaults every material enhancement off", () => {
    for (const flag of Object.values(FEATURE_FLAGS)) {
      expect(isFeatureEnabled(flag, {})).toBe(false);
    }
  });

  it("accepts explicit true values and rejects ambiguous values", () => {
    const key = featureFlagEnvironmentKey(FEATURE_FLAGS.MULTI_ROLE_ACCOUNTS);
    expect(isFeatureEnabled(FEATURE_FLAGS.MULTI_ROLE_ACCOUNTS, { [key]: "true" })).toBe(true);
    expect(isFeatureEnabled(FEATURE_FLAGS.MULTI_ROLE_ACCOUNTS, { [key]: "ON" })).toBe(true);
    expect(isFeatureEnabled(FEATURE_FLAGS.MULTI_ROLE_ACCOUNTS, { [key]: "enabled" })).toBe(false);
    expect(isFeatureEnabled(FEATURE_FLAGS.MULTI_ROLE_ACCOUNTS, { [key]: "0" })).toBe(false);
  });
});
