/**
 * Institutional (INGO) account track (Stage 16 step 5). An org's
 * `org_type` (migration 0100) is self-declared at signup/edit, staff can
 * correct it during verification review. NGOs, INGOs and government
 * bodies get invoice + bank-transfer billing instead of per-milestone
 * mobile money — real institutional procurement pays by bank transfer
 * against an invoice with payment terms, not mobile money, and this
 * codebase has no bank-transfer payment *gateway* to automate that, so
 * it's staff-confirmed instead (see lib/actions/institutionalPayments.ts).
 */
export const ORG_TYPES = ["individual", "company", "ngo", "ingo", "government", "other"] as const;
export type OrgType = (typeof ORG_TYPES)[number];

export const ORG_TYPE_LABEL: Record<OrgType, string> = {
  individual: "Individual",
  company: "Company",
  ngo: "NGO",
  ingo: "International NGO (INGO)",
  government: "Government body",
  other: "Other",
};

const INSTITUTIONAL_TYPES: readonly OrgType[] = ["ngo", "ingo", "government"];

export function isInstitutional(orgType: string | null | undefined): boolean {
  return INSTITUTIONAL_TYPES.includes(orgType as OrgType);
}

/** Standard institutional payment terms — not yet configurable per org; a fixed Net 30 is the common default. */
export const DEFAULT_PAYMENT_TERMS_DAYS = 30;
