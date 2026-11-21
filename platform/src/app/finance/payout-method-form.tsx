"use client";

import { useActionState, useState } from "react";
import { savePayoutMethod, type PayoutMethodState } from "@/lib/actions/payoutMethod";
import { PAYOUT_METHODS, type PayoutMethod, type PayoutMethodRow } from "@/lib/domain/payoutMethods";
import { useT } from "@/i18n/client";

const input = "mt-1 min-h-11 w-full rounded-control border border-slate/25 px-3 text-sm";

export function PayoutMethodForm({ current }: { current: PayoutMethodRow | null }) {
  const t = useT();
  const [state, action, pending] = useActionState(savePayoutMethod, {} as PayoutMethodState);
  const [method, setMethod] = useState<PayoutMethod>(current?.method ?? "mtn_momo");
  const err = (k: string) => state.errors?.[k]?.[0];

  return (
    <form action={action} className="mt-3 space-y-3 rounded-card border border-line bg-white p-4 shadow-card">
      <fieldset>
        <legend className="text-sm font-semibold text-midnight">{t("Pay me by")}</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {(Object.keys(PAYOUT_METHODS) as PayoutMethod[]).map((m) => (
            <label key={m} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-control border px-3 text-sm ${method === m ? "border-teal bg-teal/5" : "border-slate/25"}`}>
              <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} />
              {t(PAYOUT_METHODS[m])}
            </label>
          ))}
        </div>
      </fieldset>

      {method === "bank" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm text-midnight">
            {t("Bank")}
            <input name="bank_name" defaultValue={current?.bank_name ?? ""} className={input} />
            {err("bank_name") && <span className="mt-1 block text-xs text-coral-ink">{t(err("bank_name")!)}</span>}
          </label>
          <label className="text-sm text-midnight">
            {t("Name on the account")}
            <input name="account_name" defaultValue={current?.account_name ?? ""} className={input} />
            {err("account_name") && <span className="mt-1 block text-xs text-coral-ink">{t(err("account_name")!)}</span>}
          </label>
          <label className="text-sm text-midnight">
            {t("Account number")}
            <input name="account_number" defaultValue={current?.account_number ?? ""} className={input} />
            {err("account_number") && <span className="mt-1 block text-xs text-coral-ink">{t(err("account_number")!)}</span>}
          </label>
        </div>
      ) : (
        <label className="block text-sm text-midnight">
          {t("Phone number for {method}", { method: t(PAYOUT_METHODS[method]) })}
          <input name="phone" type="tel" inputMode="tel" defaultValue={current?.method !== "bank" ? (current?.phone ?? "") : ""} placeholder="0912 345 678" className={input} />
          {err("phone") && <span className="mt-1 block text-xs text-coral-ink">{t(err("phone")!)}</span>}
        </label>
      )}

      {state.message && (
        <p className="text-sm text-coral-ink" role="alert">
          {t(state.message)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="min-h-11 rounded-control bg-primary px-4 text-sm font-extrabold text-white hover:bg-primary-hover disabled:opacity-60">
          {pending ? t("Saving…") : t("Save")}
        </button>
        {state.saved && (
          <span className="text-sm text-teal-ink" role="status">
            {t("Saved. Payments will go here.")}
          </span>
        )}
      </div>
      <p className="text-xs text-slate">{t("Only you and the AdorWorks finance team can see these details.")}</p>
    </form>
  );
}
