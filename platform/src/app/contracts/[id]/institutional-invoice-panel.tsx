import { formatDate } from "@/lib/domain/format";

/**
 * Shown instead of PaymentCheckout for institutional (ngo/ingo/government)
 * orgs — this milestone is being settled by invoice and bank transfer,
 * not mobile money (Stage 16 step 5). Purely informational here; the
 * actual "payment received" confirmation is a staff-only action at
 * /operations/invoices (confirmInstitutionalPayment), never self-serve.
 */
export function InstitutionalInvoicePanel({
  invoice,
}: {
  invoice: {
    amount: number;
    currency: string;
    status: string;
    due_date: string | null;
    payment_terms_days: number | null;
    bank_reference: string | null;
    confirmed_at: string | null;
  };
}) {
  if (invoice.status === "confirmed") {
    return (
      <div className="mt-3 rounded-lg border border-teal-ink/20 bg-teal-ink/5 p-3 text-sm">
        <p className="font-semibold text-teal-ink">Payment received by bank transfer</p>
        <p className="mt-1 text-xs text-slate">
          {invoice.confirmed_at ? `Confirmed ${formatDate(invoice.confirmed_at)}. ` : ""}
          {invoice.bank_reference && `Reference ${invoice.bank_reference}.`}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-coral/30 bg-coral/5 p-3 text-sm">
      <p className="font-bold text-coral-ink">Invoice issued — awaiting bank transfer</p>
      <dl className="mt-2 space-y-1 text-xs">
        <div className="flex justify-between">
          <dt className="text-slate">Amount due</dt>
          <dd className="font-semibold text-midnight">
            {invoice.currency} {invoice.amount.toLocaleString()}
          </dd>
        </div>
        {invoice.payment_terms_days && (
          <div className="flex justify-between">
            <dt className="text-slate">Payment terms</dt>
            <dd className="text-midnight">Net {invoice.payment_terms_days}</dd>
          </div>
        )}
        {invoice.due_date && (
          <div className="flex justify-between">
            <dt className="text-slate">Due date</dt>
            <dd className="text-midnight">{formatDate(invoice.due_date)}</dd>
          </div>
        )}
      </dl>
      <p className="mt-2 text-xs text-slate">
        Pay by bank transfer using your organisation&rsquo;s billing details on file. AdorWorks staff confirm receipt
        once your bank transfer clears — this updates automatically, no action needed here.
      </p>
    </div>
  );
}
