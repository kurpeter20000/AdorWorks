"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordManualPayout, resetStuckPayout, sendPayout } from "@/lib/actions/escrow";
import { formatDate, formatDateTime } from "@/lib/domain/format";
import type { PayoutMethod } from "@/lib/domain/payoutMethods";

export interface PayoutRow {
  id: string;
  contractId: string;
  netAmount: number;
  currency: string;
  /** Held in escrow (false = paid while escrow was off). */
  held: boolean;
  disputeWindowEndsAt: string | null;
  disbursementStatus: "pending" | "succeeded" | "failed" | null;
  failureReason: string | null;
  attempts: number;
  lastAttemptAt: string | null;
  isSimulated: boolean;
  /** The talent's chosen payout method (0114); null = not set yet. */
  method: PayoutMethod | null;
  payTo: string;
  disputed: boolean;
}

export function PayoutsConsole({ due, stuck, waiting, canPay }: { due: PayoutRow[]; stuck: PayoutRow[]; waiting: PayoutRow[]; canPay: boolean }) {
  return (
    <div className="mt-6 space-y-8">
      {stuck.length > 0 && (
        <section>
          <h2 className="font-bold text-coral-ink">Stuck mid-payout ({stuck.length})</h2>
          <p className="mt-1 text-xs text-slate">
            The app stopped while sending these, so nobody knows if the money left. Check the MTN statement first: if it went
            out, record it with the reference; if it didn&rsquo;t, reset it so it can be sent again.
          </p>
          <ul className="mt-3 space-y-2">
            {stuck.map((row) => (
              <StuckRowItem key={row.id} row={row} canPay={canPay} />
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="font-bold text-midnight">Due now ({due.length})</h2>
        {due.length === 0 ? (
          <p className="mt-2 text-sm text-slate">Nothing due for payout right now.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {due.map((row) => (
              <DueRowItem key={row.id} row={row} canPay={canPay} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-bold text-midnight">Not due yet ({waiting.length})</h2>
        {waiting.length === 0 ? (
          <p className="mt-2 text-sm text-slate">Nothing else waiting.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {waiting.map((row) => (
              <li key={row.id} className="rounded-xl border border-slate/15 bg-cloud/40 p-4 text-sm">
                <Summary row={row} />
                <p className="text-xs text-slate">
                  {row.disputed
                    ? "Waiting for the open dispute on this contract to be resolved."
                    : row.disputeWindowEndsAt
                      ? `Due ${formatDate(row.disputeWindowEndsAt)}, when the dispute window ends.`
                      : "Held — no dispute window recorded."}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Summary({ row }: { row: PayoutRow }) {
  return (
    <>
      <p className="font-semibold text-midnight">
        {row.currency} {row.netAmount.toLocaleString()}
        {row.isSimulated && <span className="ms-2 rounded-full bg-slate/10 px-2 py-0.5 text-xs font-semibold text-slate">Test payment</span>}
      </p>
      <p className={`mt-1 text-xs ${row.method ? "text-midnight" : "font-semibold text-coral-ink"}`}>Pay to: {row.payTo}</p>
      {row.disbursementStatus === "failed" && (
        <p className="mt-1 text-xs font-semibold text-coral-ink">
          Attempt {row.attempts} failed{row.lastAttemptAt ? ` (${formatDateTime(row.lastAttemptAt)})` : ""}: {row.failureReason}
        </p>
      )}
      <a href={`/contracts/${row.contractId}`} className="text-xs font-semibold text-teal-ink underline">
        View contract
      </a>
    </>
  );
}

function useRefreshOn(done: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (done) router.refresh();
  }, [done, router]);
}

function DueRowItem({ row, canPay }: { row: PayoutRow; canPay: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [manualOpen, setManualOpen] = useState(row.method !== null && row.method !== "mtn_momo");

  function send() {
    setError(null);
    startTransition(async () => {
      const result = await sendPayout(row.id);
      if (result.message) {
        setError(result.message);
        router.refresh();
        return;
      }
      setSent(true);
      router.refresh();
    });
  }

  return (
    <li className="rounded-xl border border-slate/15 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Summary row={row} />
          <p className="text-xs text-slate">
            {row.held && row.disputeWindowEndsAt ? `Dispute window ended ${formatDate(row.disputeWindowEndsAt)}` : "Paid while escrow was off — due now"}
          </p>
        </div>
        {!canPay ? (
          <p className="text-xs font-semibold text-slate">Only finance or admin staff can pay out.</p>
        ) : !row.method ? (
          <p className="max-w-56 text-xs font-semibold text-coral-ink">Can&rsquo;t pay yet: the talent hasn&rsquo;t chosen a payout method.</p>
        ) : row.method === "mtn_momo" ? (
          <button type="button" disabled={pending || sent} onClick={send} className="rounded-lg bg-teal px-3 py-1.5 text-xs font-bold text-midnight disabled:opacity-60">
            {sent ? "Sent" : pending ? "Sending…" : row.disbursementStatus === "failed" ? "Try MTN again" : "Send by MTN MoMo"}
          </button>
        ) : null}
      </div>
      {error && <p className="mt-2 text-xs text-coral-ink">{error}</p>}
      {canPay && row.method && !sent && (
        <div className="mt-3 border-t border-slate/10 pt-3">
          {row.method === "mtn_momo" && !manualOpen ? (
            <button type="button" onClick={() => setManualOpen(true)} className="text-xs font-semibold text-slate underline">
              Sent it by hand instead? Record it
            </button>
          ) : (
            manualOpen && <ManualPayoutForm row={row} />
          )}
        </div>
      )}
    </li>
  );
}

function ManualPayoutForm({ row }: { row: PayoutRow }) {
  const [state, action, pending] = useActionState(recordManualPayout.bind(null, row.id), {});
  const done = "released" in state && Boolean(state.released);
  useRefreshOn(done);
  if (done) return <p className="text-xs font-semibold text-teal-ink">Recorded. The talent has been told.</p>;
  return (
    <form action={action} className="space-y-2">
      <p className="text-xs text-slate">
        {row.method === "mtn_momo"
          ? "Sent from AdorWorks' MTN account by hand? Enter the transaction ID."
          : `Send ${row.currency} ${row.netAmount.toLocaleString()} to the details above, then enter the reference from the ${row.method === "mgurush" ? "mGurush" : "bank"} statement.`}
      </p>
      <div className="flex flex-wrap items-start gap-2">
        <label className="text-xs">
          <span className="sr-only">Transaction reference</span>
          <input name="reference" required minLength={4} placeholder="Transaction reference" className="w-52 rounded-lg border border-slate/25 px-2 py-1.5 text-xs" />
        </label>
        <button type="submit" disabled={pending} className="rounded-lg bg-teal px-3 py-1.5 text-xs font-bold text-midnight disabled:opacity-60">
          {pending ? "Recording…" : "Record payout"}
        </button>
      </div>
      {state.errors?.reference && <p className="text-xs text-coral-ink">{state.errors.reference[0]}</p>}
      {state.message && <p className="text-xs text-coral-ink" role="alert">{state.message}</p>}
    </form>
  );
}

function StuckRowItem({ row, canPay }: { row: PayoutRow; canPay: boolean }) {
  const [state, action, pending] = useActionState(resetStuckPayout.bind(null, row.id), {});
  const done = "reset" in state && Boolean(state.reset);
  useRefreshOn(done);
  return (
    <li className="rounded-xl border border-coral/30 bg-white p-4 text-sm">
      <Summary row={row} />
      <p className="text-xs text-slate">Started {row.lastAttemptAt ? formatDateTime(row.lastAttemptAt) : "at an unknown time"}.</p>
      {canPay && (
        <div className="mt-3 grid gap-3 border-t border-slate/10 pt-3 sm:grid-cols-2">
          <ManualPayoutForm row={row} />
          <form action={action} className="space-y-2">
            <p className="text-xs text-slate">Checked and it did NOT go out? Say what you checked, then reset it.</p>
            <div className="flex flex-wrap items-start gap-2">
              <input name="note" required minLength={10} placeholder="e.g. Not on MTN statement 21 Nov" className="w-52 rounded-lg border border-slate/25 px-2 py-1.5 text-xs" aria-label="What you checked" />
              <button type="submit" disabled={pending} className="rounded-lg border border-coral/40 px-3 py-1.5 text-xs font-bold text-coral-ink disabled:opacity-60">
                {pending ? "Resetting…" : "Reset"}
              </button>
            </div>
            {state.errors?.note && <p className="text-xs text-coral-ink">{state.errors.note[0]}</p>}
            {state.message && <p className="text-xs text-coral-ink" role="alert">{state.message}</p>}
          </form>
        </div>
      )}
    </li>
  );
}
