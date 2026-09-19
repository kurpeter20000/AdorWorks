/**
 * S11-12: the pilot runs in South Sudan only — every date/time shown to a
 * user should read the same way regardless of what timezone their device
 * happens to be set to (a shared office computer, a phone with the wrong
 * region). Before this, every toLocaleDateString()/toLocaleString() call
 * site used the browser's local timezone implicitly and inconsistently.
 * Juba has no daylight-saving rule and a single UTC+3 offset year-round
 * (IANA "Africa/Juba"), so this is a safe fixed constant, not something
 * that needs to track a changing rule.
 */
export const PILOT_TIMEZONE = "Africa/Juba";

export function formatDate(input: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return d.toLocaleDateString("en-GB", { timeZone: PILOT_TIMEZONE, ...opts });
}

export function formatDateTime(input: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return d.toLocaleString("en-GB", { timeZone: PILOT_TIMEZONE, ...opts });
}

/**
 * Shared with the talent dashboard's "Recommended for you" widget — one
 * formatting rule, not a second copy that could drift from
 * /opportunities' own.
 */
export function formatCompensation(o: {
  payment_basis: string | null;
  compensation_amount: number | null;
  compensation_min: number | null;
  compensation_max: number | null;
  currency: string | null;
}): string {
  const currency = o.currency || "SSP";
  if (o.compensation_amount) return `${currency} ${o.compensation_amount.toLocaleString()}`;
  if (o.compensation_min && o.compensation_max) {
    return `${currency} ${o.compensation_min.toLocaleString()}–${o.compensation_max.toLocaleString()}`;
  }
  if (o.payment_basis === "negotiable") return "Negotiable";
  return "Paid — details on application";
}
