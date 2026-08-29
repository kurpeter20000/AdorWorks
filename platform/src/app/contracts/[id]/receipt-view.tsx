"use client";

import { useState } from "react";

const PROVIDER_LABEL: Record<string, string> = {
  mgurush: "m-Gurush",
  mtn_momo: "MTN Mobile Money",
  visa_mastercard: "Card",
};

export function ReceiptView({
  receiptNumber,
  amount,
  currency,
  providerName,
  payerPhone,
  cardLast4,
  cardBrand,
  externalReference,
  createdAt,
  feePercent,
  feeAmount,
  netAmount,
  isSimulated,
}: {
  receiptNumber: string | null;
  amount: number;
  currency: string;
  providerName: string;
  payerPhone: string | null;
  cardLast4: string | null;
  cardBrand: string | null;
  externalReference: string;
  createdAt: string;
  feePercent: number;
  feeAmount: number;
  netAmount: number;
  isSimulated: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-xs font-semibold text-teal-ink underline">
        View receipt
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-slate/15 bg-white p-3 text-sm print:border-none">
      <div className="flex items-start justify-between">
        <p className="font-bold text-midnight">Payment receipt</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate print:hidden">
          Hide
        </button>
      </div>
      <dl className="mt-2 space-y-1 text-xs">
        <div className="flex justify-between">
          <dt className="text-slate">Receipt number</dt>
          <dd className="font-semibold text-midnight">{receiptNumber ?? "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate">Gross amount</dt>
          <dd className="font-semibold text-midnight">
            {currency} {amount.toLocaleString()}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate">Platform fee ({feePercent}%)</dt>
          <dd>
            {currency} {feeAmount.toLocaleString()}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="font-semibold text-midnight">Net paid to talent</dt>
          <dd className="font-semibold text-midnight">
            {currency} {netAmount.toLocaleString()}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate">Provider</dt>
          <dd>{PROVIDER_LABEL[providerName] ?? providerName}</dd>
        </div>
        {payerPhone && (
          <div className="flex justify-between">
            <dt className="text-slate">Payer phone</dt>
            <dd>{payerPhone}</dd>
          </div>
        )}
        {cardLast4 && (
          <div className="flex justify-between">
            <dt className="text-slate">Card</dt>
            <dd>
              {cardBrand} •••• {cardLast4}
            </dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-slate">Reference</dt>
          <dd>{externalReference}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate">Date</dt>
          <dd>{new Date(createdAt).toLocaleString()}</dd>
        </div>
      </dl>
      {isSimulated && <p className="mt-2 text-xs text-coral-ink">Simulated payment — no real money moved.</p>}
      <button
        type="button"
        onClick={() => window.print()}
        className="mt-2 text-xs font-semibold text-teal-ink underline print:hidden"
      >
        Print
      </button>
    </div>
  );
}
