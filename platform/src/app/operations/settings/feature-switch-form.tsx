"use client";

import { useActionState } from "react";
import { updateFeatureSwitch } from "@/lib/actions/settings";

/** Finance/admin: turn the Employer Guarantee or programme sharing on once the wording is approved (0120). */
export function FeatureSwitchForm({ settingKey, enabled, label, warning }: { settingKey: "guarantee" | "programme_sharing"; enabled: boolean; label: string; warning: string }) {
  const [state, action, pending] = useActionState(updateFeatureSwitch, {});
  const input = "w-full rounded-lg border border-slate/25 px-3 py-2 text-sm focus:border-teal focus:outline-none";
  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="key" value={settingKey} />
      <label className="flex items-start gap-3 rounded-lg border border-slate/15 p-3 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="mt-0.5 size-4 accent-teal" />
        <span>
          <span className="block font-semibold text-midnight">{label}</span>
          <span className="block text-xs text-slate">{warning}</span>
        </span>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-midnight">Reason for the change</span>
        <input name="reason" required minLength={10} className={input} placeholder="e.g. Wording approved by counsel on 5 Jan" />
        {state.errors?.reason && <span className="mt-1 block text-xs text-coral-ink">{state.errors.reason[0]}</span>}
      </label>
      {state.message && <p className="text-sm text-coral-ink" role="alert">{state.message}</p>}
      {"saved" in state && state.saved && <p className="text-sm text-teal-ink" role="status">Saved.</p>}
      <button type="submit" disabled={pending} className="rounded-lg bg-teal px-4 py-2 text-sm font-bold text-midnight disabled:opacity-60">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
