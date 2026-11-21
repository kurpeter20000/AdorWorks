"use client";

import { useActionState } from "react";
import { updateReceivingBankAccount } from "@/lib/actions/settings";
import type { ReceivingBankAccount } from "@/lib/domain/bankTransfer";

export function BankAccountForm({ current }: { current: ReceivingBankAccount | null }) {
  const [state, action, pending] = useActionState(updateReceivingBankAccount, {});
  const input = "w-full rounded-lg border border-slate/25 px-3 py-2 text-sm focus:border-teal focus:outline-none";
  const err = (k: string) => state.errors?.[k]?.[0];

  const field = (name: string, label: string, value: string, opts: { required?: boolean; placeholder?: string } = {}) => (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold text-midnight">
        {label}
        {!opts.required && <span className="font-normal text-slate"> (optional)</span>}
      </span>
      <input name={name} required={opts.required} defaultValue={value} placeholder={opts.placeholder} className={input} />
      {err(name) && <span className="mt-1 block text-xs text-coral-ink">{err(name)}</span>}
    </label>
  );

  return (
    <form action={action} className="mt-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {field("bankName", "Bank", current?.bankName ?? "", { required: true, placeholder: "e.g. Equity Bank South Sudan" })}
        {field("accountName", "Name on the account", current?.accountName ?? "", { required: true })}
        {field("accountNumber", "Account number", current?.accountNumber ?? "", { required: true })}
        {field("branch", "Branch", current?.branch ?? "", { placeholder: "e.g. Juba Main" })}
        {field("swiftCode", "SWIFT code", current?.swiftCode ?? "", { placeholder: "For transfers from abroad" })}
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-midnight">Reason for the change</span>
        <input name="reason" required minLength={10} className={input} placeholder="e.g. Equity account opened — enabling bank transfer" />
        {err("reason") && <span className="mt-1 block text-xs text-coral-ink">{err("reason")}</span>}
      </label>

      {state.message && <p className="text-sm text-coral-ink" role="alert">{state.message}</p>}
      {"saved" in state && state.saved && (
        <p className="text-sm text-teal-ink" role="status">
          Saved. Employers see these details for bank transfers started from now on.
        </p>
      )}

      <button type="submit" disabled={pending} className="rounded-lg bg-teal px-4 py-2 text-sm font-bold text-midnight disabled:opacity-60">
        {pending ? "Saving…" : "Save bank account"}
      </button>
    </form>
  );
}
