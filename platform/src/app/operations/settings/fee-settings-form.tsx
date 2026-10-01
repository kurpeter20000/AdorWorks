"use client";

import { useActionState } from "react";
import { updateFeeSettings } from "@/lib/actions/settings";

export function FeeSettingsForm({
  enabled,
  employerPercent,
  talentPercent,
}: {
  enabled: boolean;
  employerPercent: number;
  talentPercent: number;
}) {
  const [state, action, pending] = useActionState(updateFeeSettings, {});
  const input = "w-full rounded-lg border border-slate/25 px-3 py-2 text-sm focus:border-teal focus:outline-none";

  return (
    <form action={action} className="mt-4 space-y-4">
      <label className="flex items-start gap-3 rounded-lg border border-slate/15 p-3 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="mt-0.5 size-4 accent-teal" />
        <span>
          <span className="block font-semibold text-midnight">Charge fees</span>
          <span className="block text-xs text-slate">
            The public Pricing page says AdorWorks charges 0% today. Announce the change (and update that page) before
            switching this on.
          </span>
        </span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-midnight">Employer fee (% added on top)</span>
          <input name="employerPercent" type="number" step="0.1" min="0" max="30" defaultValue={employerPercent} className={input} />
          {state.errors?.employerPercent && <span className="mt-1 block text-xs text-coral-ink">{state.errors.employerPercent[0]}</span>}
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-midnight">Talent fee (% deducted)</span>
          <input name="talentPercent" type="number" step="0.1" min="0" max="30" defaultValue={talentPercent} className={input} />
          {state.errors?.talentPercent && <span className="mt-1 block text-xs text-coral-ink">{state.errors.talentPercent[0]}</span>}
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-midnight">Reason for the change</span>
        <input name="reason" required minLength={10} className={input} placeholder="e.g. Fees announced on 1 Nov — switching on" />
        {state.errors?.reason && <span className="mt-1 block text-xs text-coral-ink">{state.errors.reason[0]}</span>}
      </label>

      {state.message && <p className="text-sm text-coral-ink" role="alert">{state.message}</p>}
      {"saved" in state && state.saved && (
        <p className="text-sm text-teal-ink" role="status">
          Saved. Applies to payments made from now on.
        </p>
      )}

      <button type="submit" disabled={pending} className="rounded-lg bg-teal px-4 py-2 text-sm font-bold text-midnight disabled:opacity-60">
        {pending ? "Saving…" : "Save fee settings"}
      </button>
    </form>
  );
}
