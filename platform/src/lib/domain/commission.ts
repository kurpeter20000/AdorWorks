/**
 * AdorWorks' commission (owner request, 2026-11-21): the employer fee and
 * the talent fee on every payment received. AdorWorks receives the whole
 * payment into one of its accounts (MTN MoMo, mGurush or bank) and pays
 * the talent their net share, so the commission is what stays behind in
 * that account. Totalled per account and currency. Test payments are
 * counted separately so they never inflate the real figures.
 */
export interface CommissionInput {
  provider_name: string;
  currency: string;
  employer_fee_amount: number | null;
  fee_amount: number | null;
  is_simulated: boolean;
}

export interface CommissionLine {
  channel: "mtn_momo" | "mgurush" | "bank_transfer" | "other";
  currency: string;
  payments: number;
  fromEmployers: number;
  fromTalent: number;
  total: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const CHANNELS = ["mtn_momo", "mgurush", "bank_transfer"] as const;

export function summariseCommission(rows: CommissionInput[]): { live: CommissionLine[]; test: CommissionLine[] } {
  const build = (subset: CommissionInput[]) => {
    const map = new Map<string, CommissionLine>();
    for (const r of subset) {
      const channel = (CHANNELS as readonly string[]).includes(r.provider_name) ? (r.provider_name as CommissionLine["channel"]) : "other";
      const key = `${channel}|${r.currency}`;
      const line = map.get(key) ?? { channel, currency: r.currency, payments: 0, fromEmployers: 0, fromTalent: 0, total: 0 };
      line.payments += 1;
      line.fromEmployers = round2(line.fromEmployers + Number(r.employer_fee_amount ?? 0));
      line.fromTalent = round2(line.fromTalent + Number(r.fee_amount ?? 0));
      line.total = round2(line.fromEmployers + line.fromTalent);
      map.set(key, line);
    }
    const order = (c: string) => [...CHANNELS, "other"].indexOf(c);
    return [...map.values()].sort((a, b) => order(a.channel) - order(b.channel) || a.currency.localeCompare(b.currency));
  };
  return { live: build(rows.filter((r) => !r.is_simulated)), test: build(rows.filter((r) => r.is_simulated)) };
}
