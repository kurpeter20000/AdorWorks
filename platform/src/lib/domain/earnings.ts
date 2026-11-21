/**
 * Talent Earnings card (competitive brief): this month, waiting to be
 * sent, and already sent — per currency, from the talent's own received
 * payments. "Sent" means AdorWorks has paid it out to the talent's payout
 * method (0116); before that it's waiting (held in escrow or queued).
 */
export interface EarningsInput {
  net_amount: number;
  currency: string;
  created_at: string;
  escrow_status: string | null;
  disbursement_status: string | null;
  disbursed_at: string | null;
}

export interface EarningsLine {
  currency: string;
  thisMonth: number;
  waiting: number;
  sent: number;
  total: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function isPaidOut(p: Pick<EarningsInput, "escrow_status" | "disbursement_status">): boolean {
  return p.disbursement_status === "succeeded" || p.escrow_status === "released";
}

/** `now` is injectable for tests; "this month" is the calendar month in Juba time. */
export function summariseEarnings(rows: EarningsInput[], now: Date = new Date()): EarningsLine[] {
  const monthKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Africa/Juba" }).slice(0, 7);
  const current = monthKey(now);
  const map = new Map<string, EarningsLine>();
  for (const r of rows) {
    const line = map.get(r.currency) ?? { currency: r.currency, thisMonth: 0, waiting: 0, sent: 0, total: 0 };
    const amount = Number(r.net_amount) || 0;
    line.total = round2(line.total + amount);
    if (monthKey(new Date(r.created_at)) === current) line.thisMonth = round2(line.thisMonth + amount);
    if (isPaidOut(r)) line.sent = round2(line.sent + amount);
    else line.waiting = round2(line.waiting + amount);
    map.set(r.currency, line);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}
