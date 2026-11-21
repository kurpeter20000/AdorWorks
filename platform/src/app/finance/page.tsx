import type { Metadata } from "next";
import { PayoutMethodForm } from "./payout-method-form";
import Link from "next/link";
import { requireSession } from "@/lib/dal/session";
import { getDashboardKind } from "@/lib/domain/roles";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney } from "@/lib/domain/format";
import { StatePanel } from "@/components/state-panel";
import { isPaidOut, summariseEarnings } from "@/lib/domain/earnings";
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
    const [{ data: received, error: summaryError }, { data: recent, error: recentError }, { data: payoutMethod }] = await Promise.all([
      supabase
        .from("payment_events")
        .select("net_amount, currency, created_at, escrow_status, disbursement_status, disbursed_at")
        .eq("status", "succeeded")
        .limit(1000),
      supabase
        .from("payment_events")
        .select("id, contract_id, net_amount, currency, receipt_number, escrow_status, dispute_window_ends_at, created_at, disbursement_status, payout_receipt_number")
        .eq("status", "succeeded")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("talent_payout_methods").select("method, phone, bank_name, account_name, account_number").eq("talent_id", session.userId).maybeSingle(),
    ]);
    const earnings = summariseEarnings(received ?? []);

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

        <section aria-labelledby="earnings-h" className="mt-6 rounded-card border border-line bg-white p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="earnings-h" className="text-lg font-extrabold text-midnight">
              {t("Earnings")}
            </h2>
            <Link href="/finance/proof-of-work" className="inline-flex min-h-11 items-center rounded-control border border-slate/30 px-3 text-sm font-bold text-midnight hover:bg-cloud">
              {t("Download proof of work")}
            </Link>
          </div>
          {earnings.length === 0 ? (
            <p className="mt-2 text-sm text-slate">{t("Nothing paid yet — figures appear here once your first milestone is paid.")}</p>
          ) : (
            earnings.map((e) => (
              <dl key={e.currency} className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-control bg-cloud px-3 py-2">
                  <dt className="text-xs font-semibold text-slate">{t("This month")}</dt>
                  <dd className="mt-0.5 text-lg font-extrabold text-midnight">{formatMoney(e.thisMonth, e.currency)}</dd>
                </div>
                <div className="rounded-control bg-amber-tint/60 px-3 py-2">
                  <dt className="text-xs font-semibold text-slate">{t("Waiting to be sent")}</dt>
                  <dd className="mt-0.5 text-lg font-extrabold text-midnight">{formatMoney(e.waiting, e.currency)}</dd>
                </div>
                <div className="rounded-control bg-teal/8 px-3 py-2">
                  <dt className="text-xs font-semibold text-slate">{t("Sent to you")}</dt>
                  <dd className="mt-0.5 text-lg font-extrabold text-teal-ink">{formatMoney(e.sent, e.currency)}</dd>
                </div>
                <div className="rounded-control bg-cloud px-3 py-2">
                  <dt className="text-xs font-semibold text-slate">{t("Total earned")}</dt>
                  <dd className="mt-0.5 text-lg font-extrabold text-midnight">{formatMoney(e.total, e.currency)}</dd>
                </div>
              </dl>
            ))
          )}
          <p className="mt-3 text-xs text-slate">{t("Amounts are after AdorWorks fees. Each payment has a receipt — open it from the list below.")}</p>
        </section>

        <h2 className="mt-8 text-lg font-extrabold text-midnight">{t("How you get paid")}</h2>
        <p className="mt-1 text-sm text-slate">{t("Choose where your money goes when a milestone is released.")}</p>
        <PayoutMethodForm current={payoutMethod ?? null} />

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
                      {isPaidOut(p) ? ` · ${t("Sent to you")}` : ` · ${t("Waiting to be sent")}`}
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
