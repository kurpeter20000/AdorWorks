"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { confirmBankTransfer } from "@/lib/actions/bankTransfers";
import { formatDate } from "@/lib/domain/format";

export interface AwaitingTransferRow {
  id: string;
  contract_id: string;
  transfer_reference: string | null;
  amount: number;
  currency: string;
  created_at: string;
  organisationName: string;
}

/** Bank transfers employers have started (0116), from any bank, waiting for the money to land. */
export function BankTransfersConsole({ rows, canConfirm }: { rows: AwaitingTransferRow[]; canConfirm: boolean }) {
  if (rows.length === 0) return <p className="mt-2 text-sm text-slate">No bank transfers waiting.</p>;
  return (
    <ul className="mt-3 space-y-2">
      {rows.map((row) => (
        <TransferRow key={row.id} row={row} canConfirm={canConfirm} />
      ))}
    </ul>
  );
}

function TransferRow({ row, canConfirm }: { row: AwaitingTransferRow; canConfirm: boolean }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(confirmBankTransfer.bind(null, row.id), {});
  const confirmed = "confirmed" in state && state.confirmed;
  useEffect(() => {
    if (confirmed) router.refresh();
  }, [confirmed, router]);

  return (
    <li className="rounded-xl border border-slate/15 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-midnight">
            {row.currency} {row.amount.toLocaleString()} · {row.organisationName}
          </p>
          <p className="text-xs text-slate">
            Reference <span className="font-mono font-bold text-midnight">{row.transfer_reference}</span> · started {formatDate(row.created_at)}
          </p>
          <a href={`/contracts/${row.contract_id}`} className="text-xs font-semibold text-teal-ink underline">
            View contract
          </a>
        </div>
        {confirmed ? (
          <p className="text-xs font-semibold text-teal-ink">Confirmed — milestone paid.</p>
        ) : canConfirm ? (
          <form action={action} className="flex flex-wrap items-start gap-2">
            <label className="text-xs">
              <span className="sr-only">Bank statement reference</span>
              <input
                name="bankReference"
                required
                minLength={3}
                placeholder="Statement reference"
                className="w-44 rounded-lg border border-slate/25 px-2 py-1.5 text-xs"
              />
            </label>
            <button type="submit" disabled={pending} className="rounded-lg bg-teal px-3 py-1.5 text-xs font-bold text-midnight disabled:opacity-60">
              {pending ? "Confirming…" : "Money received"}
            </button>
          </form>
        ) : (
          <p className="text-xs font-semibold text-slate">Only finance or admin staff can confirm transfers.</p>
        )}
      </div>
      {state.errors?.bankReference && <p className="mt-2 text-xs text-coral-ink">{state.errors.bankReference[0]}</p>}
      {state.message && <p className="mt-2 text-xs text-coral-ink" role="alert">{state.message}</p>}
      {!confirmed && canConfirm && (
        <p className="mt-2 text-xs text-slate">
          Only confirm once the full amount shows on AdorWorks&rsquo; bank statement with this reference.
        </p>
      )}
    </li>
  );
}
