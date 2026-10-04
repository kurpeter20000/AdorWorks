import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/dal/session";
import { getDashboardKind } from "@/lib/domain/roles";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney } from "@/lib/domain/format";
import { StatePanel } from "@/components/state-panel";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Finance") };
}

/**
 * Consolidates what's today only ever visible one contract at a time —
 * total earned/spent, what's pending release or payment, and a recent
 * payments list. Uses talent_finance_summary()/employer_finance_summary()
 * (0101), security-definer SQL functions that sum in Postgres rather
 * than pulling every historical payment_events row to the browser.
 */
export default async function FinancePage() {
  const session = await requireSession();
  const dashboardKind = getDashboardKind(session.role);
  const supabase = await createClient();
  const t = await getT();

  if (dashboardKind === "talent") {
    const [{ data: summary, error: summaryError }, { data: recent, error: recentError }] = await Promise.all([
      supabase.rpc("talent_finance_summary"),
      supabase
        .from("payment_events")
        .select("id, contract_id, net_amount, currency, receipt_number, escrow_status, dispute_window_ends_at, created_at")
        .eq("status", "succeeded")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    return (
      <main className="mx-auto max-w-3xl p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold text-midnight">{t("Finance")}</h1>
        {(summaryError || recentError) && (
          <div className="mt-4">
            <StatePanel title={t("Couldn't load your full picture")} tone="danger" role="alert">
              {t("Some of what's below may be incomplete — refresh the page to try again.")}
            </StatePanel>
          </div>
        )}

        {(summary ?? []).length === 0 ? (
          <p className="mt-6 text-sm text-slate">{t("Nothing paid yet — figures appear here once your first milestone is paid.")}</p>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {(summary ?? []).map((row) => (
              <div key={row.currency} className="rounded-xl border border-slate/15 bg-white p-4">
                <p className="text-xs font-semibold text-slate">{t("Total earned")}</p>
                <p className="mt-1 text-2xl font-extrabold text-midnight">{formatMoney(row.total_earned, row.currency)}</p>
                {row.pending_payout > 0 && (
                  <p className="mt-2 text-xs text-slate">{t("{amount} held, releasing soon", { amount: formatMoney(row.pending_payout, row.currency) })}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <h2 className="mt-8 text-lg font-extrabold text-midnight">{t("Recent payments")}</h2>
        {(recent ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-slate">{t("No payments yet.")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {(recent ?? []).map((p) => (
              <li key={p.id}>
                <Link href={`/contracts/${p.contract_id}`} className="flex items-center justify-between rounded-xl border border-slate/15 bg-white p-4 hover:border-teal/40">
                  <div>
                    <p className="font-semibold text-midnight">{formatMoney(p.net_amount, p.currency)}</p>
                    <p className="text-xs text-slate">
                      {p.receipt_number ?? t("No receipt number")} · {formatDate(p.created_at)}
                      {p.escrow_status === "held" && ` · ${t("Held until {date}", { date: p.dispute_window_ends_at ? formatDate(p.dispute_window_ends_at) : "" })}`}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    );
  }

  if (dashboardKind === "employer") {
    const [{ data: summary, error: summaryError }, { data: recent, error: recentError }] = await Promise.all([
      supabase.rpc("employer_finance_summary"),
      supabase
        .from("payment_events")
        .select("id, contract_id, total_charged, currency, receipt_number, created_at")
        .eq("status", "succeeded")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    return (
      <main className="mx-auto max-w-3xl p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold text-midnight">{t("Finance")}</h1>
        {(summaryError || recentError) && (
          <div className="mt-4">
            <StatePanel title={t("Couldn't load your full picture")} tone="danger" role="alert">
              {t("Some of what's below may be incomplete — refresh the page to try again.")}
            </StatePanel>
          </div>
        )}

        {(summary ?? []).length === 0 ? (
          <p className="mt-6 text-sm text-slate">{t("Nothing to show yet — figures appear here once you've paid your first milestone.")}</p>
        ) : (
          <div className="mt-6 space-y-3">
            {(summary ?? []).map((row) => (
              <div key={row.currency} className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate/15 bg-white p-4">
                  <p className="text-xs font-semibold text-slate">{t("Total spent")}</p>
                  <p className="mt-1 text-2xl font-extrabold text-midnight">{formatMoney(row.total_spent, row.currency)}</p>
                </div>
                <Link href="/contracts" className="rounded-xl border border-slate/15 bg-white p-4 hover:border-teal/40">
                  <p className="text-xs font-semibold text-slate">{t("Invoices due")}</p>
                  <p className="mt-1 text-2xl font-extrabold text-midnight">{row.invoices_due_count}</p>
                  {row.invoices_due_count > 0 && <p className="mt-1 text-xs text-slate">{formatMoney(row.invoices_due_amount, row.currency)}</p>}
                </Link>
                <Link href="/contracts" className="rounded-xl border border-slate/15 bg-white p-4 hover:border-teal/40">
                  <p className="text-xs font-semibold text-slate">{t("Milestones to pay")}</p>
                  <p className="mt-1 text-2xl font-extrabold text-midnight">{row.milestones_to_pay_count}</p>
                  {row.milestones_to_pay_count > 0 && <p className="mt-1 text-xs text-slate">{formatMoney(row.milestones_to_pay_amount, row.currency)}</p>}
                </Link>
              </div>
            ))}
          </div>
        )}

        <h2 className="mt-8 text-lg font-extrabold text-midnight">{t("Recent payments")}</h2>
        {(recent ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-slate">{t("No payments yet.")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {(recent ?? []).map((p) => (
              <li key={p.id}>
                <Link href={`/contracts/${p.contract_id}`} className="flex items-center justify-between rounded-xl border border-slate/15 bg-white p-4 hover:border-teal/40">
                  <div>
                    <p className="font-semibold text-midnight">{formatMoney(p.total_charged, p.currency)}</p>
                    <p className="text-xs text-slate">{p.receipt_number ?? t("No receipt number")} · {formatDate(p.created_at)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">{t("Finance")}</h1>
      <p className="mt-2 text-sm text-slate">{t("Nothing to show for this account type.")}</p>
    </main>
  );
}
