import type { VerificationTier } from "@/lib/database.types";

// Same wording as lib/domain/readiness.ts's TIER_LABEL (that one's
// i18n-wrapped for the talent's own dashboard; this one is plain —
// every place this badge is used today, employer-facing applicant
// lists and the public Passport page, is already outside the i18n
// pipeline, matching how the rest of those pages are written).
const TIER_LABEL: Record<VerificationTier, string> = {
  registered: "Registered",
  identity_verified: "Identity verified",
  adorverified: "AdorVerified",
  adorcertified: "AdorCertified",
  team_lead: "Team lead",
};

// Deliberately only two visual weights, not five — AdorVerified/
// AdorCertified are the two tiers meant to actually read as "this
// person cleared something," so those get the accent treatment. The
// other three stay neutral rather than inventing three more colors
// nobody asked for.
const STRONG_TIERS = new Set<VerificationTier>(["adorverified", "adorcertified"]);

export function VerificationBadge({ tier }: { tier: VerificationTier }) {
  const strong = STRONG_TIERS.has(tier);
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        strong ? "bg-violet/10 text-violet" : "bg-cloud text-slate"
      }`}
    >
      {strong && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-3" aria-hidden="true">
          <path d="m9 12 2 2 4-5" />
          <path d="M12 3 5 6v5c0 4.8 3 8.3 7 10 4-1.7 7-5.2 7-10V6l-7-3Z" />
        </svg>
      )}
      {TIER_LABEL[tier] ?? tier}
    </span>
  );
}
