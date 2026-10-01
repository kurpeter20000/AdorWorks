import type { Category, EngagementType, PaymentBasis, WorkMode } from "@/lib/database.types";
import { msg } from "@/i18n/config";

/**
 * Canonical labels for the opportunity/talent taxonomy. Stage 1 fixes this
 * as the one place new code reads these from — CATEGORY_LABEL/
 * ENGAGEMENT_LABEL/WORK_MODE_LABEL are still duplicated locally in
 * opportunities/page.tsx and organisation/opportunities/new/opportunity-
 * form.tsx; those are left as-is rather than force-migrated in this pass
 * (same "new pages use the shared contract, existing ones keep their own
 * for now" precedent as domain/states.ts). Values are enum labels only —
 * this is not a talent-editable taxonomy service.
 */
export const CATEGORY_LABEL = {
  creative_media: msg("Creative & media"),
  digital_technology: msg("Digital & technology"),
  business_project_support: msg("Business & project support"),
} as const satisfies Record<Category, string>;

export const ENGAGEMENT_TYPE_LABEL = {
  freelance: msg("Freelance"),
  fixed_term_contract: msg("Fixed-term contract"),
  full_time: msg("Full-time"),
  internship: msg("Internship"),
  apprenticeship: msg("Apprenticeship"),
  managed_service: msg("Managed service"),
} as const satisfies Record<EngagementType, string>;

export const WORK_MODE_LABEL = {
  remote: msg("Remote"),
  on_site: msg("On-site"),
  hybrid: msg("Hybrid"),
  any: msg("Any"),
} as const satisfies Record<WorkMode, string>;

export const PAYMENT_BASIS_LABEL = {
  fixed: msg("Fixed price"),
  milestone: msg("Per milestone"),
  hourly: msg("Hourly"),
  daily: msg("Daily"),
  monthly: msg("Monthly"),
  negotiable: msg("Negotiable"),
} as const satisfies Record<PaymentBasis, string>;

export function categoryOptions() {
  return Object.entries(CATEGORY_LABEL) as [Category, string][];
}

export function engagementTypeOptions() {
  return Object.entries(ENGAGEMENT_TYPE_LABEL) as [EngagementType, string][];
}

export function workModeOptions() {
  return Object.entries(WORK_MODE_LABEL) as [WorkMode, string][];
}

export function paymentBasisOptions() {
  return Object.entries(PAYMENT_BASIS_LABEL) as [PaymentBasis, string][];
}
