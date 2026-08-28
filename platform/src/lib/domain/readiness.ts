import type { VerificationTier, TalentProfileRow, OrganisationRow } from "@/lib/database.types";

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
  registered: "Registered",
  identity_verified: "Identity verified",
  adorverified: "AdorVerified",
  adorcertified: "AdorCertified",
  team_lead: "Team lead",
};

const TIER_NEXT_STEP: Record<VerificationTier, string | null> = {
  registered: "Verify your identity to unlock more opportunities.",
  identity_verified: "Add a reference or complete an assessment to reach AdorVerified.",
  adorverified: "Complete a paid engagement to build toward AdorCertified.",
  adorcertified: "You've reached the highest tier available today.",
  team_lead: "You've reached the highest tier available today.",
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
  if (!profile.headline) missing.push("Add a headline");
  if (!profile.bio) missing.push("Add a short bio");
  if (!profile.skills || profile.skills.length === 0) missing.push("Add at least one skill");
  if (!profile.category) missing.push("Choose a category");
  if (!profile.location) missing.push("Add your location");
  if (!profile.avatar_path) missing.push("Add a profile photo");
  if (!profile.safety_orientation_completed_at) missing.push("Complete the free Trust & Safety orientation");

  const complete = missing.length === 0;

  return {
    readiness: { complete, missing },
    trust: { label: TIER_LABEL[profile.verification_tier], nextStep: TIER_NEXT_STEP[profile.verification_tier] },
    visibility: {
      visible: profile.public_visible,
      reason: profile.public_visible
        ? null
        : complete
          ? "Your profile is complete — AdorWorks staff review it before making it publicly discoverable."
          : "Finish your profile first — staff only review complete profiles for public visibility.",
    },
  };
}

const ORG_STATUS_LABEL: Record<OrganisationRow["verification_status"], string> = {
  pending: "Pending verification",
  verified: "Verified",
  rejected: "Not verified",
  suspended: "Suspended",
};

const ORG_STATUS_NEXT_STEP: Record<OrganisationRow["verification_status"], string | null> = {
  pending: "AdorWorks staff review new organisations before opportunities go live.",
  verified: "You're verified — opportunities you post go straight to staff review for publishing.",
  rejected: "Contact AdorWorks staff to resolve why verification was declined.",
  suspended: "Contact AdorWorks staff — this organisation is currently suspended.",
};

type EmployerReadinessInput = Pick<
  OrganisationRow,
  "sector" | "website" | "billing_email" | "registration_evidence_path" | "verification_status"
>;

export function getEmployerReadiness(org: EmployerReadinessInput, hasPostedOpportunity: boolean): ReadinessState {
  const missing: string[] = [];
  if (!org.sector) missing.push("Add your sector");
  if (!org.website) missing.push("Add your website");
  if (!org.billing_email) missing.push("Add a billing email");
  if (!org.registration_evidence_path) missing.push("Upload registration evidence for verification");
  if (!hasPostedOpportunity) missing.push("Post your first opportunity");

  const complete = missing.length === 0;

  return {
    readiness: { complete, missing },
    trust: { label: ORG_STATUS_LABEL[org.verification_status], nextStep: ORG_STATUS_NEXT_STEP[org.verification_status] },
    visibility: {
      visible: org.verification_status === "verified",
      reason:
        org.verification_status === "verified"
          ? null
          : "Opportunities only go live once your organisation is verified.",
    },
  };
}
