"use client";

import { useActionState } from "react";
import { submitAccountAppeal, type AppealState } from "@/lib/actions/accountAppeals";
import { useT } from "@/i18n/client";

const initial: AppealState = {};

export function AppealForm() {
  const t = useT();
  const [state, action, pending] = useActionState(submitAccountAppeal, initial);

  if (state.sent) {
    return (
      <p className="mt-6 rounded-control border border-teal/30 bg-teal/5 p-4 text-sm text-midnight" role="status">
        {t("Thank you. If that email belongs to a suspended account, your appeal is now with our Trust & Safety team. We'll email you the outcome.")}
      </p>
    );
  }

  return (
    <form action={action} className="mt-6 space-y-4">
      <div>
        <label htmlFor="email" className="text-sm font-semibold text-midnight">
          {t("Your account's email")}
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className="mt-1 min-h-11 w-full rounded-control border border-slate/25 px-3 text-sm" />
        {state.errors?.email && <p className="mt-1 text-sm text-coral-ink">{t(state.errors.email[0])}</p>}
      </div>
      <div>
        <label htmlFor="message" className="text-sm font-semibold text-midnight">
          {t("Why should we look again?")}
        </label>
        <textarea id="message" name="message" rows={6} required className="mt-1 w-full rounded-control border border-slate/25 px-3 py-2 text-sm" />
        {state.errors?.message && <p className="mt-1 text-sm text-coral-ink">{t(state.errors.message[0])}</p>}
      </div>
      {state.message && (
        <p className="text-sm text-coral-ink" role="alert">
          {t(state.message)}
        </p>
      )}
      <button type="submit" disabled={pending} className="min-h-11 w-full rounded-control bg-primary px-4 text-sm font-extrabold text-white hover:bg-primary-hover disabled:opacity-60">
        {pending ? t("Sending…") : t("Send appeal")}
      </button>
    </form>
  );
}
