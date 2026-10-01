import type { VerificationTier, TalentProfileRow, OrganisationRow } from "@/lib/database.types";
import { msg } from "@/i18n/config";

/**
 * Master doc §19A: keep Readiness (what's missing), Trust (what's
 * verified), and Visibility (can they currently be discovered, and
 * exactly why not if not) as three distinct signals — never collapsed
 * into one unexplained percentage or score.
 */
export interface ReadinessState {
  readiness: { complete: boolean; missing: string[] };
  trust: { label: string; nextStep: string | null };
  visibility: { visible: boolean; reason: string | null };
}

const TIER_LABEL: Record<VerificationTier, string> = {
  registered: msg("Registered"),
  identity_verified: msg("Identity verified"),
  adorverified: msg("AdorVerified"),
  adorcertified: msg("AdorCertified"),
  team_lead: msg("Team lead"),
};

const TIER_NEXT_STEP: Record<VerificationTier, string | null> = {
  registered: msg("Verify your identity to unlock more opportunities."),
  identity_verified: msg("Add a reference or complete an assessment to reach AdorVerified."),
  adorverified: msg("Complete a paid engagement to build toward AdorCertified."),
  adorcertified: msg("You've reached the highest tier available today."),
  team_lead: msg("You've reached the highest tier available today."),
};

type TalentReadinessInput = Pick<
  TalentProfileRow,
  | "headline"
  | "bio"
  | "skills"
  | "category"
  | "location"
  | "avatar_path"
  | "verification_tier"
  | "public_visible"
  | "safety_orientation_completed_at"
>;

export function getTalentReadiness(profile: TalentReadinessInput): ReadinessState {
  const missing: string[] = [];
  if (!profile.headline) missing.push(msg("Add a headline"));
  if (!profile.bio) missing.push(msg("Add a short bio"));
  if (!profile.skills || profile.skills.length === 0) missing.push(msg("Add at least one skill"));
  if (!profile.category) missing.push(msg("Choose a category"));
  if (!profile.location) missing.push(msg("Add your location"));
  if (!profile.avatar_path) missing.push(msg("Add a profile photo"));
  if (!profile.safety_orientation_completed_at) missing.push(msg("Complete the free Trust & Safety orientation"));

  const complete = missing.length === 0;

  return {
    readiness: { complete, missing },
    trust: { label: TIER_LABEL[profile.verification_tier], nextStep: TIER_NEXT_STEP[profile.verification_tier] },
    visibility: {
      visible: profile.public_visible,
      reason: profile.public_visible
        ? null
        : complete
          ? msg("Your profile is complete — AdorWorks staff review it before making it publicly discoverable.")
          : msg("Finish your profile first — staff only review complete profiles for public visibility."),
    },
  };
}

const ORG_STATUS_LABEL: Record<OrganisationRow["verification_status"], string> = {
  pending: msg("Pending verification"),
  verified: msg("Verified"),
  rejected: msg("Not verified"),
  suspended: msg("Suspended"),
};

const ORG_STATUS_NEXT_STEP: Record<OrganisationRow["verification_status"], string | null> = {
  pending: msg("AdorWorks staff review new organisations before opportunities go live."),
  verified: msg("You're verified — opportunities you post go straight to staff review for publishing."),
  rejected: msg("Contact AdorWorks staff to resolve why verification was declined."),
  suspended: msg("Contact AdorWorks staff — this organisation is currently suspended."),
};

type EmployerReadinessInput = Pick<
  OrganisationRow,
  "sector" | "website" | "billing_email" | "registration_evidence_path" | "verification_status"
>;

export function getEmployerReadiness(org: EmployerReadinessInput, hasPostedOpportunity: boolean): ReadinessState {
  const missing: string[] = [];
  if (!org.sector) missing.push(msg("Add your sector"));
  if (!org.website) missing.push(msg("Add your website"));
  if (!org.billing_email) missing.push(msg("Add a billing email"));
  if (!org.registration_evidence_path) missing.push(msg("Upload registration evidence for verification"));
  if (!hasPostedOpportunity) missing.push(msg("Post your first opportunity"));

  const complete = missing.length === 0;

  return {
    readiness: { complete, missing },
    trust: { label: ORG_STATUS_LABEL[org.verification_status], nextStep: ORG_STATUS_NEXT_STEP[org.verification_status] },
    visibility: {
      visible: org.verification_status === "verified",
      reason:
        org.verification_status === "verified"
          ? null
          : msg("Opportunities only go live once your organisation is verified."),
    },
  };
}
