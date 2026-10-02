"use client";

import { useState } from "react";
import { formatDateTime } from "@/lib/domain/format";

const PROVIDER_LABEL: Record<string, string> = {
  mgurush: "m-Gurush",
  mtn_momo: "MTN Mobile Money",
  visa_mastercard: "Card",
  bank_transfer: "Bank transfer",
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
  employerFeePercent,
  employerFeeAmount,
  totalCharged,
  isSimulated,
  escrowStatus,
  disputeWindowEndsAt,
  disbursedAt,
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
  employerFeePercent: number;
  employerFeeAmount: number;
  totalCharged: number;
  isSimulated: boolean;
  escrowStatus?: "not_applicable" | "held" | "released";
  disputeWindowEndsAt?: string | null;
  disbursedAt?: string | null;
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
          <dt className="text-slate">Agreed amount</dt>
          <dd className="font-semibold text-midnight">
            {currency} {amount.toLocaleString()}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate">Employer fee ({employerFeePercent}%)</dt>
          <dd>
            {currency} {employerFeeAmount.toLocaleString()}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="font-semibold text-midnight">Total paid by employer</dt>
          <dd className="font-semibold text-midnight">
            {currency} {totalCharged.toLocaleString()}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate">Talent fee ({feePercent}%)</dt>
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
          <dd>{formatDateTime(createdAt)}</dd>
        </div>
      </dl>
      {escrowStatus === "held" && disputeWindowEndsAt && (
        <p className="mt-2 rounded-lg bg-cloud px-2 py-1.5 text-xs text-slate">
          Talent&rsquo;s share held until {formatDateTime(disputeWindowEndsAt)}, then released automatically unless disputed.
        </p>
      )}
      {escrowStatus === "released" && disbursedAt && (
        <p className="mt-2 rounded-lg bg-teal-ink/5 px-2 py-1.5 text-xs text-teal-ink">
          Released to talent {formatDateTime(disbursedAt)}.
        </p>
      )}
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
