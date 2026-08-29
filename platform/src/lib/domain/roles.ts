import type { UserRole } from "@/lib/database.types";

/**
 * Runtime role catalogue matching the current `user_role` database enum.
 * Keep this list in the same change as any additive role migration so role
 * grouping and navigation cannot silently omit a valid account type.
 */
export const USER_ROLES = [
  "talent",
  "employer",
  "reviewer",
  "matcher",
  "finance",
  "admin",
  "individual_client",
  "org_member",
  "org_admin",
  "onboarding_agent",
  "partner_hub_admin",
] as const satisfies readonly UserRole[];

export const EMPLOYER_ACCOUNT_ROLES = [
  "individual_client",
  "employer",
  "org_member",
  "org_admin",
] as const satisfies readonly UserRole[];

export const STAFF_ACCOUNT_ROLES = [
  "reviewer",
  "matcher",
  "finance",
  "admin",
] as const satisfies readonly UserRole[];

export type DashboardKind = "talent" | "employer" | "assistance" | "operations" | "partner";

/** Human-friendly account-role label for the nav's role Badge — display only, never used for authorization. */
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  talent: "Talent",
  employer: "Employer",
  individual_client: "Client",
  org_member: "Team member",
  org_admin: "Org admin",
  reviewer: "Reviewer",
  matcher: "Matcher",
  finance: "Finance",
  admin: "Admin",
  onboarding_agent: "Assistance",
  partner_hub_admin: "Partner",
};

/** Which Badge variant a role's label renders in — grouped by account kind, not per-role. */
export function getRoleBadgeVariant(role: UserRole): "success" | "accent" | "warning" {
  if (role === "talent") return "success";
  if (isStaffAccountRole(role)) return "warning";
  return "accent";
}

const employerRoles = new Set<UserRole>(EMPLOYER_ACCOUNT_ROLES);
const staffRoles = new Set<UserRole>(STAFF_ACCOUNT_ROLES);

export function isEmployerAccountRole(role: UserRole): boolean {
  return employerRoles.has(role);
}

export function isStaffAccountRole(role: UserRole): boolean {
  return staffRoles.has(role);
}

export function getDashboardKind(role: UserRole): DashboardKind {
  if (role === "talent") return "talent";
  if (isEmployerAccountRole(role)) return "employer";
  if (role === "onboarding_agent") return "assistance";
  if (isStaffAccountRole(role)) return "operations";
  return "partner";
}
