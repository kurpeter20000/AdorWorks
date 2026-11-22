import { msg } from "@/i18n/config";
import type { ApprovalStatus, UserRole } from "@/lib/database.types";
import { EMPLOYER_ACCOUNT_ROLES } from "./roles";

/**
 * Staff approval of new accounts (0128). Talent and employer accounts
 * that people create themselves wait for approval; staff and the roles
 * staff create are always approved. Pure, tested in approval.test.ts.
 */
export function needsApproval(role: UserRole): boolean {
  return role === "talent" || (EMPLOYER_ACCOUNT_ROLES as readonly string[]).includes(role);
}

/** Which staff section approves this account. */
export function approvalSection(role: UserRole): "talent" | "organisations" | null {
  if (role === "talent") return "talent";
  if ((EMPLOYER_ACCOUNT_ROLES as readonly string[]).includes(role)) return "organisations";
  return null;
}

/** Why this person can't do a gated action yet, or null if they can. */
export function approvalBlock(s: { role: UserRole; approvalStatus: ApprovalStatus }): string | null {
  if (!needsApproval(s.role) || s.approvalStatus === "approved") return null;
  return s.approvalStatus === "declined"
    ? msg("Your account wasn't approved, so this isn't available. Message support if you think this is a mistake.")
    : msg("Your account is waiting for approval by AdorWorks. You can do this as soon as it's approved — usually within 2 business days.");
}

/** The database refuses with this wording when the app check was skipped (0128). */
export function isApprovalError(message: string | null | undefined): boolean {
  return Boolean(message && /waiting for approval by AdorWorks/i.test(message));
}
