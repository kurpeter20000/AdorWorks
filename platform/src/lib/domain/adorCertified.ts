import type { VerificationTier } from "@/lib/database.types";

/**
 * AdorCertified progress (owner, 2026-11-16): "verified, all your
 * documents recorded into our system, and courses we may add later —
 * eligible to work, with proven skills". Courses don't exist yet, so
 * that step shows as coming later and doesn't count against anyone.
 * Staff still confirm the tier itself.
 */
export interface CertifiedStep {
  key: "identity" | "documents" | "courses" | "confirmed";
  label: string;
  hint: string;
  state: "done" | "todo" | "later";
}

const RANK: Record<VerificationTier, number> = { registered: 0, identity_verified: 1, adorverified: 2, adorcertified: 3, team_lead: 4 };

export function adorCertifiedSteps(input: {
  tier: VerificationTier;
  approvedEvidenceTypes: string[];
}): { steps: CertifiedStep[]; done: number; total: number } {
  const types = new Set(input.approvedEvidenceTypes);
  const identity = RANK[input.tier] >= 1 || types.has("identity");
  const documents = types.has("identity") && (types.has("portfolio") || types.has("reference") || types.has("assessment"));
  const confirmed = RANK[input.tier] >= 3;
  const steps: CertifiedStep[] = [
    { key: "identity", label: "Identity verified", hint: "Upload your ID so our team can check it.", state: identity ? "done" : "todo" },
    {
      key: "documents",
      label: "Documents recorded",
      hint: "Your ID plus proof of your skills — a certificate, reference or work sample — approved by our team.",
      state: documents ? "done" : "todo",
    },
    { key: "courses", label: "AdorWorks courses", hint: "Short courses are coming. You don't need them yet.", state: "later" },
    {
      key: "confirmed",
      label: "AdorCertified",
      hint: "Our team confirms you're eligible to work and have proven the skills for it.",
      state: confirmed ? "done" : "todo",
    },
  ];
  const counted = steps.filter((s) => s.state !== "later");
  return { steps, done: counted.filter((s) => s.state === "done").length, total: counted.length };
}
