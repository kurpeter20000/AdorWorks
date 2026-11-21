"use client";

import { useState, type ReactNode } from "react";
import { formatDateTime } from "@/lib/domain/format";
import { msg } from "@/i18n/config";
import { useT } from "@/i18n/client";

const PROVIDER_LABEL: Record<string, string> = {
  mtn_momo: msg("MTN Mobile Money"),
  mgurush: msg("mGurush"),
  bank_transfer: msg("Bank transfer"),
  // Old simulated rows only — card is no longer offered (0116).
  visa_mastercard: msg("Card"),
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
  payoutDestination,
  payoutReceiptNumber,
  payoutReference,
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
  /** 0116: where the talent's share went — shown to the talent and staff only. */
  payoutDestination?: string | null;
  payoutReceiptNumber?: string | null;
  payoutReference?: string | null;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const money = (n: number) => `${currency} ${n.toLocaleString()}`;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 min-h-11 text-xs font-semibold text-teal-ink underline">
        {t("View receipt")}
      </button>
    );
  }

  const row = (label: string, value: ReactNode, strong = false) => (
    <div className="flex flex-wrap justify-between gap-x-3">
      <dt className={strong ? "font-semibold text-midnight" : "text-slate"}>{label}</dt>
      <dd className={`${strong ? "font-semibold text-midnight" : ""} break-all`}>{value}</dd>
    </div>
  );

  return (
    <div className="mt-2 rounded-lg border border-slate/15 bg-white p-3 text-sm print:border-none">
      <div className="flex items-start justify-between">
        <p className="font-bold text-midnight">{t("Payment receipt")}</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate print:hidden">
          {t("Hide")}
        </button>
      </div>
      <dl className="mt-2 space-y-1 text-xs">
        {row(t("Receipt number"), receiptNumber ?? "—", true)}
        {row(t("Agreed amount"), money(amount), true)}
        {row(t("Employer fee ({percent}%)", { percent: employerFeePercent }), money(employerFeeAmount))}
        {row(t("Total paid by employer"), money(totalCharged), true)}
        {row(t("Talent fee ({percent}%)", { percent: feePercent }), money(feeAmount))}
        {row(t("Net to talent"), money(netAmount), true)}
        {row(t("Paid with"), PROVIDER_LABEL[providerName] ? t(PROVIDER_LABEL[providerName]) : providerName)}
        {payerPhone && row(t("Payer phone"), payerPhone)}
        {cardLast4 && row(t("Card"), `${cardBrand ?? ""} •••• ${cardLast4}`)}
        {row(t("Reference"), externalReference)}
        {row(t("Date"), formatDateTime(createdAt))}
      </dl>

      {disbursedAt ? (
        <div className="mt-2 rounded-lg bg-teal-ink/5 px-2 py-1.5 text-xs text-teal-ink">
          <p>{t("Talent's share sent {date}.", { date: formatDateTime(disbursedAt) })}</p>
          {payoutDestination && <p>{t("Sent to: {destination}", { destination: payoutDestination })}</p>}
          {payoutReference && <p>{t("Payout reference: {reference}", { reference: payoutReference })}</p>}
          {payoutReceiptNumber && <p>{t("Payout receipt: {number}", { number: payoutReceiptNumber })}</p>}
        </div>
      ) : escrowStatus === "held" && disputeWindowEndsAt ? (
        <p className="mt-2 rounded-lg bg-cloud px-2 py-1.5 text-xs text-slate">
          {t("Talent's share is held until {date}. Unless a dispute is raised, AdorWorks then sends it to the talent's payout method.", {
            date: formatDateTime(disputeWindowEndsAt),
          })}
        </p>
      ) : (
        <p className="mt-2 rounded-lg bg-cloud px-2 py-1.5 text-xs text-slate">
          {t("AdorWorks is sending the talent's share to their payout method.")}
        </p>
      )}
      {isSimulated && <p className="mt-2 text-xs text-coral-ink">{t("Test payment — no real money moved.")}</p>}
      <button type="button" onClick={() => window.print()} className="mt-2 text-xs font-semibold text-teal-ink underline print:hidden">
        {t("Print")}
      </button>
    </div>
  );
}
