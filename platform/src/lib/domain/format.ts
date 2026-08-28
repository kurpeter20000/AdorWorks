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
