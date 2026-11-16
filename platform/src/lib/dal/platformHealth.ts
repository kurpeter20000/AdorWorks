import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- untyped query builders: several tables aren't in the hand-written types */
import { createAdminClient } from "@/lib/supabase/admin";
import { change, hasVaguePay, median } from "@/lib/domain/platformHealth";

/**
 * Spec "Platform health" and "Fair-ranking check" for the staff
 * overview. Totals only — no names or personal data — read with the
 * service role so every staff role sees the same true numbers (some of
 * these tables are finance-only row by row). Callers must already have
 * checked the viewer is staff.
 */
const DAY = 86_400_000;

export interface HealthLine {
  label: string;
  value: string;
  change?: ReturnType<typeof change>;
}

export async function loadPlatformHealth(now = Date.now()): Promise<{ lines: HealthLine[]; vaguePay: { id: string; title: string }[]; failed: boolean }> {
  const admin = createAdminClient();
  const thisWeek = new Date(now - 7 * DAY).toISOString();
  const lastWeek = new Date(now - 14 * DAY).toISOString();
  const month = new Date(now - 30 * DAY).toISOString();

  const count = async (table: string, column: string, from: string, to: string | null, extra?: (q: any) => any) => {
    let q: any = (admin as any).from(table).select("*", { count: "exact", head: true }).gte(column, from);
    if (to) q = q.lt(column, to);
    if (extra) q = extra(q);
    const { count: n, error } = await q;
    if (error) throw error;
    return n ?? 0;
  };
  const pair = async (table: string, column: string, extra?: (q: any) => any) => {
    const [now7, prev7] = await Promise.all([count(table, column, thisWeek, null, extra), count(table, column, lastWeek, thisWeek, extra)]);
    return { now7, prev7 };
  };

  try {
    const [talent, orgs, published, applications, contracts, released, viewed, open] = await Promise.all([
      pair("profiles", "created_at", (q) => q.eq("role", "talent")),
      pair("organisations", "created_at"),
      pair("opportunities", "approved_at"),
      pair("applications", "created_at"),
      pair("contracts", "created_at"),
      admin.from("payment_events").select("net_amount, currency, escrow_status, disbursed_at, created_at").eq("status", "succeeded").gte("created_at", lastWeek),
      admin.from("applications").select("created_at, viewed_at").gte("created_at", month).not("viewed_at", "is", null),
      admin.from("opportunities").select("id, title, payment_basis, compensation_amount, compensation_min, compensation_max").eq("status", "open"),
    ]);
    if (released.error || viewed.error || open.error) throw released.error ?? viewed.error ?? open.error;

    // Released to talent this week: escrow released in the window, or paid
    // straight through (escrow off) in the window. Per currency.
    const releasedAt = (p: { escrow_status: string; disbursed_at: string | null; created_at: string }) =>
      p.escrow_status === "released" ? p.disbursed_at : p.escrow_status === "not_applicable" ? p.created_at : null;
    const byCurrency = new Map<string, number>();
    for (const p of released.data ?? []) {
      const at = releasedAt(p);
      if (at && at >= thisWeek) byCurrency.set(p.currency, (byCurrency.get(p.currency) ?? 0) + Number(p.net_amount));
    }
    const money = [...byCurrency.entries()].map(([c, n]) => `${c} ${Math.round(n).toLocaleString("en-GB")}`).join(" · ") || "0";

    const days = (viewed.data ?? []).map((a) => (Date.parse(a.viewed_at!) - Date.parse(a.created_at)) / DAY);
    const med = median(days);

    const line = (label: string, p: { now7: number; prev7: number }): HealthLine => ({ label, value: String(p.now7), change: change(p.now7, p.prev7) });
    return {
      lines: [
        line("New talent sign-ups", talent),
        line("New organisations", orgs),
        line("Opportunities published", published),
        line("Applications sent", applications),
        line("Contracts started", contracts),
        { label: "Money released to talent", value: money },
        { label: "Median days until an employer opens an application (30 days)", value: med === null ? "—" : med.toFixed(1) },
      ],
      vaguePay: (open.data ?? []).filter(hasVaguePay).map((o) => ({ id: o.id, title: o.title })),
      failed: false,
    };
  } catch (err) {
    console.error("[platform-health] failed:", err);
    return { lines: [], vaguePay: [], failed: true };
  }
}
