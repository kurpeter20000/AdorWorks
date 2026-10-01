"use client";

import { useActionState } from "react";
import { updateEscrowSettings } from "@/lib/actions/settings";

export function EscrowSettingsForm({ enabled, disputeWindowDays }: { enabled: boolean; disputeWindowDays: number }) {
  const [state, action, pending] = useActionState(updateEscrowSettings, {});
  const input = "w-full rounded-lg border border-slate/25 px-3 py-2 text-sm focus:border-teal focus:outline-none";

  return (
    <form action={action} className="mt-4 space-y-4">
      <label className="flex items-start gap-3 rounded-lg border border-slate/15 p-3 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="mt-0.5 size-4 accent-teal" />
        <span>
          <span className="block font-semibold text-midnight">Hold payments in escrow</span>
          <span className="block text-xs text-slate">
            The public site says AdorWorks does not hold client funds. Leave this off until the legal questions in the
            Stage 16 doc are answered and an MTN disbursement agreement exists — switching it on without that is a
            compliance decision, not a UI one.
          </span>
        </span>
      </label>

      <label className="block text-sm sm:max-w-xs">
        <span className="mb-1 block font-semibold text-midnight">Dispute window (days)</span>
        <input name="disputeWindowDays" type="number" step="1" min="1" max="30" defaultValue={disputeWindowDays} className={input} />
        {state.errors?.disputeWindowDays && <span className="mt-1 block text-xs text-coral-ink">{state.errors.disputeWindowDays[0]}</span>}
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-midnight">Reason for the change</span>
        <input name="reason" required minLength={10} className={input} placeholder="e.g. Legal cleared escrow on 1 Nov — switching on" />
        {state.errors?.reason && <span className="mt-1 block text-xs text-coral-ink">{state.errors.reason[0]}</span>}
      </label>

      {state.message && <p className="text-sm text-coral-ink" role="alert">{state.message}</p>}
      {"saved" in state && state.saved && (
        <p className="text-sm text-teal-ink" role="status">
          Saved. Applies to payments made from now on.
        </p>
      )}

      <button type="submit" disabled={pending} className="rounded-lg bg-teal px-4 py-2 text-sm font-bold text-midnight disabled:opacity-60">
        {pending ? "Saving…" : "Save escrow settings"}
      </button>
    </form>
  );
}
