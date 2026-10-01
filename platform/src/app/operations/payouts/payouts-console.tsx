"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { releaseEscrowedPayment } from "@/lib/actions/escrow";
import { formatDate } from "@/lib/domain/format";

interface EligibleRow {
  payment_event_id: string;
  contract_id: string;
  net_amount: number;
  currency: string;
  dispute_window_ends_at: string;
}

interface HeldRow {
  id: string;
  contract_id: string;
  net_amount: number;
  currency: string;
  dispute_window_ends_at: string | null;
  disbursement_status: string | null;
  disbursement_failure_reason: string | null;
}

export function PayoutsConsole({ eligible, notYetDue }: { eligible: EligibleRow[]; notYetDue: HeldRow[] }) {
  return (
    <div className="mt-6 space-y-8">
      <section>
        <h2 className="font-bold text-midnight">Due now ({eligible.length})</h2>
        {eligible.length === 0 ? (
          <p className="mt-2 text-sm text-slate">Nothing due for release right now.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {eligible.map((row) => (
              <EligibleRowItem key={row.payment_event_id} row={row} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-bold text-midnight">Held, not yet due ({notYetDue.length})</h2>
        {notYetDue.length === 0 ? (
          <p className="mt-2 text-sm text-slate">Nothing else currently held.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {notYetDue.map((row) => (
              <li key={row.id} className="rounded-xl border border-slate/15 bg-cloud/40 p-4 text-sm">
                <p className="font-semibold text-midnight">
                  {row.currency} {row.net_amount.toLocaleString()}
                </p>
                <p className="text-xs text-slate">
                  {row.dispute_window_ends_at
                    ? `Releases ${formatDate(row.dispute_window_ends_at)} (or sooner once any dispute is resolved)`
                    : "Held — no dispute window recorded"}
                </p>
                {row.disbursement_status === "failed" && (
                  <p className="mt-1 text-xs font-semibold text-coral-ink">Last attempt failed: {row.disbursement_failure_reason}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function EligibleRowItem({ row }: { row: EligibleRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [released, setReleased] = useState(false);

  function release() {
    setError(null);
    startTransition(async () => {
      const result = await releaseEscrowedPayment(row.payment_event_id);
      if (result.message) {
        setError(result.message);
        return;
      }
      setReleased(true);
      router.refresh();
    });
  }

  return (
    <li className="rounded-xl border border-slate/15 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-midnight">
            {row.currency} {row.net_amount.toLocaleString()}
          </p>
          <p className="text-xs text-slate">Dispute window ended {formatDate(row.dispute_window_ends_at)}</p>
        </div>
        <button
          type="button"
          disabled={pending || released}
          onClick={release}
          className="rounded-lg bg-teal px-3 py-1.5 text-xs font-bold text-midnight disabled:opacity-60"
        >
          {released ? "Released" : pending ? "Releasing…" : "Release payout"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-coral-ink">{error}</p>}
    </li>
  );
}
