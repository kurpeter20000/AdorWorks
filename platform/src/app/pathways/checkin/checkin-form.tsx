"use client";

import { useActionState, useState, useTransition } from "react";
import { checkInToSession, rateSession } from "@/lib/actions/pathwaysSessions";
import { useT } from "@/i18n/client";

export function CheckinForm({ initialCode }: { initialCode: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(checkInToSession, {});
  const [rated, setRated] = useState<number | null>(null);
  const [rating, start] = useTransition();

  if ("sessionId" in state && state.sessionId) {
    const sessionId = state.sessionId;
    return (
      <div className="mt-5 rounded-card border border-teal/30 bg-teal/5 p-5" role="status">
        <p className="font-bold text-midnight">{t("You're checked in to {title}.", { title: state.title ?? "" })}</p>
        <p className="mt-3 text-sm font-semibold text-midnight">{t("How useful was this session?")}</p>
        <div className="mt-2 flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              disabled={rating || rated !== null}
              onClick={() => start(async () => { const r = await rateSession(sessionId, n); if (!r.error) setRated(n); })}
              className={`size-11 rounded-full border text-sm font-bold ${rated !== null && n <= rated ? "border-teal bg-teal text-midnight" : "border-slate/30 bg-white text-midnight"}`}
              aria-label={t("{n} out of 5", { n })}
            >
              {n}
            </button>
          ))}
        </div>
        {rated !== null && <p className="mt-2 text-sm text-teal-ink">{t("Thank you for your feedback.")}</p>}
      </div>
    );
  }
  return (
    <form action={action} className="mt-5 space-y-3">
      <label className="block text-sm font-semibold text-midnight">
        {t("Session code")}
        <input name="code" defaultValue={initialCode} required autoCapitalize="characters" placeholder="IN-7KQ4" className="mt-1 min-h-12 w-full rounded-control border border-slate/25 px-3 font-mono text-lg tracking-widest uppercase" />
      </label>
      {state.errors?.code && <p className="text-sm text-coral-ink">{t(state.errors.code[0])}</p>}
      {state.message && <p className="text-sm text-coral-ink" role="alert">{t(state.message)}</p>}
      <button type="submit" disabled={pending} className="min-h-11 w-full rounded-control bg-teal px-4 text-sm font-bold text-midnight disabled:opacity-60">
        {pending ? t("Checking in…") : t("Check in")}
      </button>
    </form>
  );
}
