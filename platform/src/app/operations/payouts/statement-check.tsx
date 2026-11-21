"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { runReconciliation, type ReconcileState } from "@/lib/actions/paymentChecks";
import { formatDate, formatDateTime } from "@/lib/domain/format";

type Line = { row: number; date: string | null; reference: string; amount: number; direction: "in" | "out"; description: string };
type Entry = { id: string; kind: string; references: string[]; amount: number; date: string; label: string };

export interface RunView {
  id: string;
  account: string;
  periodStart: string | null;
  periodEnd: string | null;
  fileName: string | null;
  lines: number;
  matched: number;
  unmatched: Line[];
  missing: Entry[];
  mismatches: { line: Line; entry: Entry }[];
  createdAt: string;
}

const ACCOUNT_LABEL: Record<string, string> = { mtn_momo: "MTN MoMo", mgurush: "mGurush", bank_ssp: "Bank (SSP)", bank_usd: "Bank (USD)" };
const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

/**
 * Statement check (0125): upload an MTN, mGurush or bank statement (CSV)
 * and see which lines match AdorWorks' payments and payouts, which don't,
 * and which of ours are missing from the statement.
 */
export function StatementCheck({ runs, canRun }: { runs: RunView[]; canRun: boolean }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(runReconciliation, {} as ReconcileState);
  useEffect(() => {
    if (state.runId) router.refresh();
  }, [state.runId, router]);
  const input = "rounded-lg border border-slate/25 px-2 py-1.5 text-sm";
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="mt-6 rounded-xl border border-slate/15 bg-white p-5">
      <h2 className="text-lg font-bold text-midnight">Statement check</h2>
      <p className="mt-1 text-sm text-slate">
        Download the statement from the MTN, mGurush or bank portal as CSV and upload it here. Each line is matched to our records by
        reference — do this daily, or at least weekly.
      </p>
      {canRun && (
        <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-midnight">
            Account
            <select name="account" className={`mt-1 block ${input}`} defaultValue="mtn_momo">
              {Object.entries(ACCOUNT_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-midnight">
            From
            <input name="periodStart" type="date" defaultValue={today} className={`mt-1 block ${input}`} />
          </label>
          <label className="text-xs font-semibold text-midnight">
            To
            <input name="periodEnd" type="date" defaultValue={today} className={`mt-1 block ${input}`} />
          </label>
          <label className="text-xs font-semibold text-midnight">
            Statement (CSV)
            <input name="file" type="file" accept=".csv,text/csv" required className="mt-1 block text-sm" />
          </label>
          <input name="note" placeholder="Note (optional)" className={`${input} w-48`} />
          <button type="submit" disabled={pending} className="rounded-lg bg-teal px-4 py-2 text-sm font-bold text-midnight disabled:opacity-60">
            {pending ? "Checking…" : "Check statement"}
          </button>
          {Object.values(state.errors ?? {}).flat().map((e) => (
            <p key={e} className="w-full text-xs text-coral-ink">
              {e}
            </p>
          ))}
          {state.message && <p className="w-full text-xs text-coral-ink">{state.message}</p>}
        </form>
      )}

      {runs.length === 0 ? (
        <p className="mt-4 text-sm text-slate">No statements checked yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {runs.map((r, i) => {
            const problems = r.unmatched.length + r.missing.length + r.mismatches.length;
            return (
              <li key={r.id}>
                <details open={i === 0 && problems > 0} className="rounded-lg border border-slate/15 p-3 text-sm">
                  <summary className="cursor-pointer">
                    <span className="font-semibold text-midnight">{ACCOUNT_LABEL[r.account] ?? r.account}</span> ·{" "}
                    {r.periodStart ? formatDate(r.periodStart) : "—"} – {r.periodEnd ? formatDate(r.periodEnd) : "—"} · {r.matched}/{r.lines} matched ·{" "}
                    <span className={problems ? "font-semibold text-coral-ink" : "text-teal-ink"}>{problems ? `${problems} to follow up` : "all clear"}</span>
                    <span className="ms-2 text-xs text-slate">checked {formatDateTime(r.createdAt)}</span>
                  </summary>
                  <div className="mt-2 space-y-3 text-xs">
                    {r.mismatches.length > 0 && (
                      <div>
                        <p className="font-bold text-coral-ink">Amount doesn&rsquo;t match ({r.mismatches.length})</p>
                        <ul className="mt-1 space-y-0.5">
                          {r.mismatches.map((m) => (
                            <li key={m.entry.id}>
                              {m.line.reference}: statement {money(m.line.amount)}, AdorWorks {money(m.entry.amount)} — {m.entry.label}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {r.unmatched.length > 0 && (
                      <div>
                        <p className="font-bold text-coral-ink">On the statement, not in AdorWorks ({r.unmatched.length})</p>
                        <p className="text-slate">Money in that nobody recorded (e.g. a bank transfer not yet confirmed under Invoices), or money out we didn&rsquo;t send.</p>
                        <ul className="mt-1 space-y-0.5">
                          {r.unmatched.map((l) => (
                            <li key={`${l.row}-${l.reference}`}>
                              Row {l.row}: {l.direction === "in" ? "in" : "out"} {money(l.amount)} · {l.reference} {l.description && `· ${l.description}`}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {r.missing.length > 0 && (
                      <div>
                        <p className="font-bold text-coral-ink">In AdorWorks, not on the statement ({r.missing.length})</p>
                        <p className="text-slate">Recorded by us but not seen on this statement — check the reference, or whether it landed on another day or account.</p>
                        <ul className="mt-1 space-y-0.5">
                          {r.missing.map((e) => (
                            <li key={e.id}>
                              {e.label} · {money(e.amount)} · ref {e.references.join(" / ") || "—"}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {problems === 0 && <p className="text-teal-ink">Every line matched, and every record was on the statement.</p>}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
