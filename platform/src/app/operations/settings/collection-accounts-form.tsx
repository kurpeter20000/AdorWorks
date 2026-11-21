"use client";

import { useActionState } from "react";
import { updateCollectionAccounts } from "@/lib/actions/settings";
import type { CollectionAccounts } from "@/lib/domain/collectionAccounts";

export function CollectionAccountsForm({ current }: { current: CollectionAccounts }) {
  const [state, action, pending] = useActionState(updateCollectionAccounts, {});
  const input = "w-full rounded-lg border border-slate/25 px-3 py-2 text-sm focus:border-teal focus:outline-none";
  const err = (k: string) => state.errors?.[k]?.[0];

  const account = (key: "mtn" | "mgurush", title: string, value: CollectionAccounts["mtn_momo"]) => (
    <fieldset className="rounded-lg border border-slate/15 p-4">
      <legend className="px-1 text-sm font-bold text-midnight">{title}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-midnight">Phone number</span>
          <input name={`${key}Number`} type="tel" inputMode="tel" defaultValue={value?.number ?? ""} placeholder="0912 345 678" className={input} />
          {err(`${key}Number`) && <span className="mt-1 block text-xs text-coral-ink">{err(`${key}Number`)}</span>}
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-midnight">Name on the account</span>
          <input name={`${key}Name`} defaultValue={value?.accountName ?? ""} placeholder="e.g. AdorWorks Ltd" className={input} />
          {err(`${key}Name`) && <span className="mt-1 block text-xs text-coral-ink">{err(`${key}Name`)}</span>}
        </label>
      </div>
    </fieldset>
  );

  return (
    <form action={action} className="mt-4 space-y-4">
      {account("mtn", "MTN Mobile Money", current.mtn_momo)}
      {account("mgurush", "mGurush", current.mgurush)}
      <p className="text-xs text-slate">Leave both fields empty to remove an account.</p>

      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-midnight">Reason for the change</span>
        <input name="reason" required minLength={10} className={input} placeholder="e.g. AdorWorks MTN merchant line registered" />
        {err("reason") && <span className="mt-1 block text-xs text-coral-ink">{err("reason")}</span>}
      </label>

      {state.message && <p className="text-sm text-coral-ink" role="alert">{state.message}</p>}
      {"saved" in state && state.saved && (
        <p className="text-sm text-teal-ink" role="status">
          Saved. New mobile-money payments are recorded against these accounts.
        </p>
      )}

      <button type="submit" disabled={pending} className="rounded-lg bg-teal px-4 py-2 text-sm font-bold text-midnight disabled:opacity-60">
        {pending ? "Saving…" : "Save mobile money accounts"}
      </button>
    </form>
  );
}
