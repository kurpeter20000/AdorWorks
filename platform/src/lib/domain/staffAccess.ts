import type { UserRole } from "@/lib/database.types";

/**
 * Which staff role works which part of the operations console (Phase B2,
 * agreed with the owner on 2026-11-16). Each role sees only its own
 * queues and actions; admins see everything.
 *
 *   reviewer       opportunities (publish / request changes / reject /
 *                  appeals), services, intake
 *   verifier       talent and organisation verification
 *   trust_safety   reports, support messages, disputes, person lookup,
 *                  suspensions and appeals
 *   finance        payouts, invoices, contracts and refunds, settings
 *   field_support  assisted onboarding, support messages, person lookup
 *   matcher        shortlists (from the opportunities console) and
 *                  engagements
 *   admin          everything, including people and staff roles
 *
 * The backend API keeps the same map in
 * backend/api/src/middleware/staffAccess.js — change both together.
 */
export type StaffArea =
  | "opportunities"
  | "services"
  | "intake"
  | "talent"
  | "organisations"
  | "reports"
  | "support"
  | "engagements"
  | "contracts"
  | "payouts"
  | "invoices"
  | "settings"
  | "assisted-onboarding"
  | "people";

export const STAFF_AREA_ROLES: Record<StaffArea, readonly UserRole[]> = {
  opportunities: ["reviewer", "matcher"],
  services: ["reviewer"],
  intake: ["reviewer"],
  talent: ["verifier"],
  organisations: ["verifier"],
  reports: ["trust_safety"],
  support: ["trust_safety", "field_support"],
  engagements: ["matcher"],
  contracts: ["finance", "trust_safety"],
  payouts: ["finance"],
  invoices: ["finance"],
  settings: ["finance"],
  "assisted-onboarding": ["field_support"],
  // Lookup and notes for support roles; suspensions are Trust & Safety's;
  // staff accounts and roles stay admin-only (enforced by the staff API).
  people: ["trust_safety", "field_support"],
};

/**
 * Publishing, rejecting and requesting changes on opportunities is the
 * reviewer's job; matchers share the opportunities console only to build
 * shortlists.
 */
export const OPPORTUNITY_REVIEW_ROLES: UserRole[] = ["admin", "reviewer"];

/** Roles allowed into one staff area. Admin is always included. */
export function staffAreaRoles(area: StaffArea): UserRole[] {
  return ["admin", ...STAFF_AREA_ROLES[area]];
}

export function canUseStaffArea(role: UserRole, area: StaffArea): boolean {
  return staffAreaRoles(area).includes(role);
}

/**
 * For links: may this role open this /operations path? The overview page
 * itself (/operations) is open to every staff role; anything else must
 * belong to an area the role works.
 */
export function canOpenStaffPath(role: UserRole, href: string): boolean {
  const path = href.split("?")[0].replace(/\/+$/, "");
  if (path === "/operations") return true;
  // Team chat (0127) is for every staff role; RLS decides what each sees.
  if (path === "/team-chat") return true;
  const area = path.split("/")[2] as StaffArea | undefined;
  if (!area || !(area in STAFF_AREA_ROLES)) return role === "admin";
  return canUseStaffArea(role, area);
}

/** Staff-facing names for the role picker and badges. */
export const STAFF_ROLE_DESCRIPTIONS: Record<string, string> = {
  reviewer: "Reviews opportunities, services and intake",
  verifier: "Verifies talent and organisations",
  trust_safety: "Handles reports, disputes and support",
  finance: "Payouts, invoices, contracts and fees",
  field_support: "Assisted onboarding and in-person help",
  matcher: "Builds shortlists and runs engagements",
  admin: "Everything, including people and staff roles",
};
