export const FEATURE_FLAGS = {
  MULTI_ROLE_ACCOUNTS: "multi_role_accounts",
  SERVICE_MARKETPLACE: "service_marketplace",
  EXPLAINABLE_MATCHING: "explainable_matching",
  STRUCTURED_HIRING: "structured_hiring",
  PROFILE_VIDEO: "profile_video",
  REAL_PAYMENTS: "real_payments",
  OPERATIONS_V2: "operations_v2",
  PUBLIC_MARKETPLACE: "public_marketplace",
} as const;

export type FeatureFlagName = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

const enabledValues = new Set(["1", "true", "yes", "on"]);

export function featureFlagEnvironmentKey(name: FeatureFlagName): string {
  return `ADORWORKS_FF_${name.toUpperCase()}`;
}

/**
 * Material enhancements default off. Server Components should evaluate a
 * flag and pass the result down rather than exposing configuration or
 * relying on hidden UI as an authorization boundary.
 */
export function isFeatureEnabled(
  name: FeatureFlagName,
  environment: Record<string, string | undefined> = process.env
): boolean {
  const value = environment[featureFlagEnvironmentKey(name)];
  return value ? enabledValues.has(value.trim().toLowerCase()) : false;
}
