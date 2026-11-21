"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { payMilestone } from "@/lib/actions/contracts";
import { cancelBankTransfer } from "@/lib/actions/bankTransfers";
import type { FormState } from "@/lib/actions/auth";
import { calculateFees, type FeeSettings } from "@/lib/domain/fees";
import type { ReceivingBankAccount } from "@/lib/domain/bankTransfer";
import { msg } from "@/i18n/config";
import { useT } from "@/i18n/client";

const initialState: FormState = {};

/** Payment partners (owner decision, 2026-11-21). MTN is the default. */
const PAY_OPTIONS = [
  { id: "mtn_momo", label: msg("MTN Mobile Money"), hint: msg("Pay from your MTN MoMo wallet") },
  { id: "mgurush", label: msg("mGurush"), hint: msg("Pay from your mGurush wallet") },
  { id: "bank_transfer", label: msg("Bank transfer"), hint: msg("Send it from any bank") },
] as const;
type PayOption = (typeof PAY_OPTIONS)[number]["id"];

/** A bank transfer the employer has started but AdorWorks hasn't received yet. */
export interface AwaitingTransfer {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  account: ReceivingBankAccount | null;
  createdAt: string;
}

export function PaymentCheckout({
  milestoneId,
  amount,
  currency,
  realPaymentsEnabled,
  fees,
  bankTransferAvailable,
  awaitingTransfer,
  collectionAccountNames,
  usdToSsp,
}: {
  milestoneId: string;
  amount: number;
  currency: string;
  /** Server-computed (isFeatureEnabled reads an unprefixed env var, invisible to the client) — see contracts/[id]/page.tsx. */
  realPaymentsEnabled: boolean;
  /** Current rates, read on the server (0096 platform_settings). */
  fees: FeeSettings;
  /** False until finance staff have saved AdorWorks' receiving account. */
  bankTransferAvailable: boolean;
  awaitingTransfer: AwaitingTransfer | null;
  /** Names on AdorWorks' own MTN / mGurush accounts, so the employer sees who they're paying. */
  collectionAccountNames?: { mtn_momo: string | null; mgurush: string | null };
  /** 0125: today's rate set by finance, for showing the other currency. */
  usdToSsp?: number | null;
}) {
  const t = useT();
  const boundAction = payMilestone.bind(null, milestoneId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const [option, setOption] = useState<PayOption>("mtn_momo");
  const fee = calculateFees(amount, fees);
  const money = (n: number) => `${currency} ${n.toLocaleString()}`;

  if (awaitingTransfer) return <AwaitingTransferPanel transfer={awaitingTransfer} />;

  const options = PAY_OPTIONS.filter((o) => o.id !== "bank_transfer" || bankTransferAvailable);
  const isBank = option === "bank_transfer";

  return (
    <form action={formAction} className="mt-3 rounded-lg border border-coral/30 bg-coral/5 p-3">
      {!isBank &&
        (realPaymentsEnabled ? (
          <p className="text-xs font-bold uppercase tracking-wide text-coral-ink">{t("Live payment — real money will move")}</p>
        ) : (
          <>
            <p className="text-xs font-bold uppercase tracking-wide text-coral-ink">{t("Test mode — no real money moves")}</p>
            <p className="mt-1 text-xs text-slate">
              {t("Mobile money isn't connected yet, so this records a test payment and issues a receipt.")}
            </p>
          </>
        ))}

      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-slate">{t("Agreed amount")}</dt>
          <dd className="font-semibold text-midnight">{money(fee.amount)}</dd>
        </div>
        <div className="flex justify-between gap-3 text-xs">
          <dt className="text-slate">{t("AdorWorks fee for employers ({percent}%)", { percent: fee.employerFeePercent })}</dt>
          <dd className="text-slate">+ {money(fee.employerFeeAmount)}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-coral/20 pt-1">
          <dt className="font-semibold text-midnight">{t("You pay")}</dt>
          <dd className="font-bold text-midnight">{money(fee.totalCharged)}</dd>
        </div>
        {usdToSsp && (currency === "USD" || currency === "SSP") && (
          <div className="flex justify-between gap-3 text-xs">
            <dt className="text-slate">{t("About, at today's rate (1 USD = {rate} SSP)", { rate: usdToSsp.toLocaleString() })}</dt>
            <dd className="text-slate">
              ≈ {currency === "USD" ? `SSP ${Math.round(fee.totalCharged * usdToSsp).toLocaleString()}` : `USD ${(fee.totalCharged / usdToSsp).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-3 pt-2 text-xs">
          <dt className="text-slate">{t("AdorWorks fee for talent ({percent}%)", { percent: fee.talentFeePercent })}</dt>
          <dd className="text-slate">− {money(fee.talentFeeAmount)}</dd>
        </div>
        <div className="flex justify-between gap-3 text-xs">
          <dt className="text-slate">{t("Talent receives")}</dt>
          <dd className="font-semibold text-midnight">{money(fee.netAmount)}</dd>
        </div>
      </dl>

      <fieldset className="mt-3">
        <legend className="text-xs font-semibold text-midnight">{t("Pay with")}</legend>
        <div className={`mt-1 grid grid-cols-1 gap-2 ${options.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          {options.map((o) => (
            <label
              key={o.id}
              className="flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border border-slate/25 bg-white px-2 py-2 text-xs has-[:checked]:border-coral"
            >
              <input type="radio" name="provider" value={o.id} checked={option === o.id} onChange={() => setOption(o.id)} className="mt-0.5" />
              <span>
                <span className="block font-semibold text-midnight">{t(o.label)}</span>
                <span className="block text-slate">{t(o.hint)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {isBank ? (
        <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-slate">
          {t("Next you'll see AdorWorks' bank details and a payment reference. Send the money from any bank, quoting the reference. The milestone is marked paid once the money arrives, usually within 1–2 working days.")}
        </p>
      ) : (
        <div className="mt-3">
          <label htmlFor={`phone-${milestoneId}`} className="block text-xs font-semibold text-midnight">
            {t("Phone number to pay from")}
          </label>
          <input
            id={`phone-${milestoneId}`}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0912 345 678"
            className="mt-1 min-h-11 w-full rounded-lg border border-slate/25 px-3 text-sm"
          />
          {state.errors?.phone && <p className="mt-1 text-xs text-coral-ink">{t(state.errors.phone[0])}</p>}
          {collectionAccountNames?.[option as "mtn_momo" | "mgurush"] && (
            <p className="mt-2 text-xs text-slate">
              {t("Paid to AdorWorks' {provider} account: {name}.", {
                provider: option === "mtn_momo" ? "MTN MoMo" : "mGurush",
                name: collectionAccountNames[option as "mtn_momo" | "mgurush"]!,
              })}
            </p>
          )}
        </div>
      )}

      {state.errors?.provider && <p className="mt-1 text-xs text-coral-ink">{t(state.errors.provider[0])}</p>}
      {state.message && (
        <p className="mt-1 text-xs text-coral-ink" role="alert">
          {t(state.message)}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-3 min-h-11 w-full rounded-lg bg-coral-ink px-3 text-sm font-bold text-white disabled:opacity-60"
      >
        {pending ? t("Please wait…") : isBank ? t("Get bank details") : t("Pay {amount}", { amount: money(fee.totalCharged) })}
      </button>
    </form>
  );
}

function AwaitingTransferPanel({ transfer }: { transfer: AwaitingTransfer }) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const a = transfer.account;

  function cancel() {
    if (!window.confirm(t("Cancel this bank transfer? Only do this if you haven't sent the money."))) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelBankTransfer(transfer.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  async function copyReference() {
    try {
      await navigator.clipboard.writeText(transfer.reference);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const row = (label: string, value: string) =>
    value ? (
      <div className="flex flex-wrap justify-between gap-x-3">
        <dt className="text-slate">{label}</dt>
        <dd className="font-semibold text-midnight break-all">{value}</dd>
      </div>
    ) : null;

  return (
    <section className="mt-3 rounded-lg border border-teal/30 bg-teal/5 p-3 text-sm" aria-live="polite">
      <p className="text-xs font-bold uppercase tracking-wide text-teal-ink">{t("Waiting for your bank transfer")}</p>
      <p className="mt-1 text-xs text-slate">
        {t("Send exactly {amount} from any bank to the account below. Put the reference in the transfer's reference or narration field so we can match it.", {
          amount: `${transfer.currency} ${transfer.amount.toLocaleString()}`,
        })}
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2">
        <span>
          <span className="block text-xs text-slate">{t("Payment reference")}</span>
          <span className="block font-mono text-lg font-bold tracking-wider text-midnight">{transfer.reference}</span>
        </span>
        <button type="button" onClick={copyReference} className="min-h-11 rounded-lg border border-slate/25 px-3 text-xs font-semibold text-midnight">
          {copied ? t("Copied") : t("Copy")}
        </button>
      </div>

      {a ? (
        <dl className="mt-3 space-y-1 rounded-lg bg-white px-3 py-2 text-xs">
          {row(t("Bank"), a.bankName)}
          {row(t("Account name"), a.accountName)}
          {row(t("Account number"), a.accountNumber)}
          {row(t("Branch"), a.branch)}
          {row(t("SWIFT code"), a.swiftCode)}
        </dl>
      ) : (
        <p className="mt-3 text-xs text-coral-ink">{t("The bank details are missing. Please contact AdorWorks support.")}</p>
      )}

      <p className="mt-3 text-xs text-slate">
        {t("We'll mark the milestone paid and send you a receipt once the money arrives — usually within 1–2 working days.")}
      </p>

      {error && (
        <p className="mt-2 text-xs text-coral-ink" role="alert">
          {t(error)}
        </p>
      )}
      <button type="button" onClick={cancel} disabled={pending} className="mt-2 min-h-11 text-xs font-semibold text-coral-ink underline disabled:opacity-60">
        {pending ? t("Cancelling…") : t("Cancel this transfer and pay another way")}
      </button>
    </section>
  );
}
