"use client";

import { useActionState } from "react";
import { updateFxRate } from "@/lib/actions/settings";

/** Finance (0125): today's USD→SSP rate, shown to employers before they pay. */
export function FxForm({ current }: { current: number | null }) {
  const [state, action, pending] = useActionState(updateFxRate, {});
  const input = "w-full rounded-lg border border-slate/25 px-3 py-2 text-sm focus:border-teal focus:outline-none";
  return (
    <form action={action} className="mt-4 grid gap-3 sm:grid-cols-3">
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-midnight">1 USD = ? SSP</span>
        <input name="usdToSsp" type="number" step="0.01" min="0" required defaultValue={current ?? ""} className={input} />
        {state.errors?.usdToSsp && <span className="mt-1 block text-xs text-coral-ink">{state.errors.usdToSsp[0]}</span>}
      </label>
      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block font-semibold text-midnight">Where the rate comes from</span>
        <input name="reason" required minLength={10} className={input} placeholder="e.g. KCB selling rate, 22 Nov" />
        {state.errors?.reason && <span className="mt-1 block text-xs text-coral-ink">{state.errors.reason[0]}</span>}
      </label>
      {state.message && <p className="text-sm text-coral-ink sm:col-span-3">{state.message}</p>}
      {"saved" in state && state.saved && <p className="text-sm text-teal-ink sm:col-span-3">Saved. Employers see it at checkout now.</p>}
      <button type="submit" disabled={pending} className="rounded-lg bg-teal px-4 py-2 text-sm font-bold text-midnight disabled:opacity-60 sm:justify-self-start">
        {pending ? "Saving…" : "Save rate"}
      </button>
    </form>
  );
}
