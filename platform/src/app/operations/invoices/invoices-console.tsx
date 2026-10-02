"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmInstitutionalPayment } from "@/lib/actions/institutionalPayments";
import { formatDate } from "@/lib/domain/format";

interface InvoiceRow {
  id: string;
  contract_id: string | null;
  amount: number;
  currency: string;
  due_date: string | null;
  payment_terms_days: number | null;
  organisationName: string;
}

export function InvoicesConsole({ rows }: { rows: InvoiceRow[] }) {
  if (rows.length === 0) {
    return <p className="mt-8 text-sm text-slate">Nothing awaiting confirmation right now.</p>;
  }
  return (
    <ul className="mt-6 space-y-3">
      {rows.map((row) => (
        <InvoiceRowItem key={row.id} row={row} />
      ))}
    </ul>
  );
}

function InvoiceRowItem({ row }: { row: InvoiceRow }) {
  const router = useRouter();
  const [bankReference, setBankReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);

  function confirm() {
    if (!bankReference.trim()) {
      setError("Enter the bank transaction reference.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("bankReference", bankReference.trim());
      const result = await confirmInstitutionalPayment(row.id, {}, formData);
      if (result.message) {
        setError(result.message);
        return;
      }
      setConfirmed(true);
      router.refresh();
    });
  }

  return (
    <li className="rounded-xl border border-slate/15 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-midnight">{row.organisationName}</p>
          <p className="text-xs text-slate">
            {row.currency} {row.amount.toLocaleString()}
            {row.due_date && ` · Due ${formatDate(row.due_date)}`}
            {row.payment_terms_days && ` (Net ${row.payment_terms_days})`}
          </p>
          {row.contract_id && (
            <a href={`/contracts/${row.contract_id}`} className="text-xs font-semibold text-teal-ink underline">
              View contract
            </a>
          )}
        </div>
      </div>

      {!confirmed && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor={`bank-ref-${row.id}`} className="sr-only">
            Bank transaction reference
          </label>
          <input
            id={`bank-ref-${row.id}`}
            value={bankReference}
            onChange={(e) => setBankReference(e.target.value)}
            placeholder="Bank transaction reference"
            className="flex-1 rounded-lg border border-slate/25 px-3 py-2 text-xs"
          />
          <button
            type="button"
            disabled={pending}
            onClick={confirm}
            className="rounded-lg bg-teal px-3 py-1.5 text-xs font-bold text-midnight disabled:opacity-60"
          >
            {pending ? "Confirming…" : "Confirm payment received"}
          </button>
        </div>
      )}
      {confirmed && <p className="mt-2 text-xs font-semibold text-teal-ink">Confirmed.</p>}
      {error && <p className="mt-2 text-xs text-coral-ink">{error}</p>}
    </li>
  );
}
