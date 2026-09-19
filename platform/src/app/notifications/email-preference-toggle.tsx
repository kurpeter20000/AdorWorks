"use client";

import { useState, useTransition } from "react";
import { setEmailNotificationsEnabled } from "@/lib/actions/notifications";

/** S11-07 — the signed-in counterpart to the emailed unsubscribe link (see /unsubscribe). */
export function EmailPreferenceToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    startTransition(async () => {
      const res = await setEmailNotificationsEnabled(next);
      if (res.error) setEnabled(!next);
    });
  }

  return (
    <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-slate/15 bg-cloud/40 p-3">
      <div>
        <p className="text-sm font-semibold text-midnight">Activity emails</p>
        <p className="text-xs text-slate">Offers, applications, milestones, and similar updates by email. In-app notifications always stay on.</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Activity emails"
        disabled={pending}
        onClick={toggle}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${enabled ? "bg-teal-ink" : "bg-slate/30"}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}
