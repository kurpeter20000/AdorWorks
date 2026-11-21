"use client";

import { useActionState } from "react";
import { updateReceivingBankAccount } from "@/lib/actions/settings";
import { BANK_CURRENCIES, type BankCurrency, type ReceivingBankAccount, type ReceivingBankAccounts } from "@/lib/domain/bankTransfer";

const HINT: Record<BankCurrency, string> = {
  SSP: "e.g. Equity Bank South Sudan",
  USD: "e.g. KCB Bank South Sudan",
};

/** One AdorWorks account per currency: employers paying in SSP see the SSP account, in USD the USD one. */
export function BankAccountForm({ current }: { current: ReceivingBankAccounts }) {
  const [state, action, pending] = useActionState(updateReceivingBankAccount, {});
  const input = "w-full rounded-lg border border-slate/25 px-3 py-2 text-sm focus:border-teal focus:outline-none";
  const err = (k: string) => state.errors?.[k]?.[0];
  // An account saved before accounts were split by currency was the USD (KCB) one.
  const legacy = current["*"];
  const valueFor = (c: BankCurrency): ReceivingBankAccount | undefined => current[c] ?? (c === "USD" ? legacy : undefined);

  const field = (c: BankCurrency, name: string, label: string, value: string, opts: { required?: boolean; placeholder?: string } = {}) => (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold text-midnight">
        {label}
        {!opts.required && <span className="font-normal text-slate"> (optional)</span>}
      </span>
      <input name={`${c}_${name}`} defaultValue={value} placeholder={opts.placeholder} className={input} />
      {err(`${c}_${name}`) && <span className="mt-1 block text-xs text-coral-ink">{err(`${c}_${name}`)}</span>}
    </label>
  );

  return (
    <form action={action} className="mt-4 space-y-4">
      {legacy && !current.USD && (
        <p className="rounded-lg bg-amber-tint/60 px-3 py-2 text-xs text-midnight">
          Your earlier account has been placed under USD. Check it, add the SSP account, and save.
        </p>
      )}
      {BANK_CURRENCIES.map((c) => {
        const v = valueFor(c);
        return (
          <fieldset key={c} className="rounded-lg border border-slate/15 p-4">
            <legend className="px-1 text-sm font-bold text-midnight">{c} account</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {field(c, "bankName", "Bank", v?.bankName ?? "", { placeholder: HINT[c] })}
              {field(c, "accountName", "Name on the account", v?.accountName ?? "")}
              {field(c, "accountNumber", "Account number", v?.accountNumber ?? "")}
              {field(c, "branch", "Branch", v?.branch ?? "", { placeholder: "e.g. Juba Main" })}
              {field(c, "swiftCode", "SWIFT code", v?.swiftCode ?? "", { placeholder: "For transfers from abroad" })}
            </div>
          </fieldset>
        );
      })}
      <p className="text-xs text-slate">Leave a currency empty to turn off bank transfer for payments in that currency.</p>

      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-midnight">Reason for the change</span>
        <input name="reason" required minLength={10} className={input} placeholder="e.g. Added Equity SSP account; KCB is the USD account" />
        {err("reason") && <span className="mt-1 block text-xs text-coral-ink">{err("reason")}</span>}
      </label>

      {state.message && <p className="text-sm text-coral-ink" role="alert">{state.message}</p>}
      {"saved" in state && state.saved && (
        <p className="text-sm text-teal-ink" role="status">
          Saved. Employers see the account for their payment&rsquo;s currency on transfers started from now on.
        </p>
      )}

      <button type="submit" disabled={pending} className="rounded-lg bg-teal px-4 py-2 text-sm font-bold text-midnight disabled:opacity-60">
        {pending ? "Saving…" : "Save bank accounts"}
      </button>
    </form>
  );
}
