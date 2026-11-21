/** Small helpers for the staff "This week" numbers. Pure, so they're tested. */
export function change(current: number, previous: number): { text: string; direction: "up" | "down" | "flat" } {
  const diff = current - previous;
  if (diff === 0) return { text: "same as last week", direction: "flat" };
  const sign = diff > 0 ? "+" : "−";
  if (previous === 0) return { text: `${sign}${Math.abs(diff)} vs last week`, direction: diff > 0 ? "up" : "down" };
  return { text: `${sign}${Math.round((Math.abs(diff) / previous) * 100)}% vs last week`, direction: diff > 0 ? "up" : "down" };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** A published opportunity whose pay a talent can't plan around. */
export function hasVaguePay(o: { payment_basis: string | null; compensation_amount: number | null; compensation_min: number | null; compensation_max: number | null }): boolean {
  if (o.payment_basis === "negotiable") return true;
  if ((o.compensation_amount ?? 0) > 0) return false;
  return !((o.compensation_min ?? 0) > 0 && (o.compensation_max ?? 0) >= (o.compensation_min ?? 0));
}
