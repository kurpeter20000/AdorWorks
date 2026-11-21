"use client";

import Link from "next/link";
import { useActionState } from "react";
import { joinProgrammeByCode } from "@/lib/actions/programmeConsent";
import { useT } from "@/i18n/client";

export function JoinForm({ initialCode }: { initialCode: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(joinProgrammeByCode, {});
  if ("joined" in state && state.joined) {
    return (
      <div className="mt-5 rounded-card border border-teal/30 bg-teal/5 p-5" role="status">
        <p className="font-bold text-midnight">{t("You've joined {programme}.", { programme: state.joined })}</p>
        <p className="mt-1 text-sm text-midnight">{t("Next: finish your Passport so your progress counts.")}</p>
        <Link href="/passport" className="mt-3 inline-flex min-h-11 items-center rounded-control bg-teal px-4 text-sm font-bold text-midnight">
          {t("Go to my Passport")}
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="mt-5 space-y-3">
      <label className="block text-sm font-semibold text-midnight">
        {t("Programme code")}
        <input
          name="code"
          defaultValue={initialCode}
          required
          autoCapitalize="characters"
          placeholder="EDUP-7KQ4"
          className="mt-1 min-h-12 w-full rounded-control border border-slate/25 px-3 font-mono text-lg tracking-widest uppercase"
        />
      </label>
      {state.errors?.code && <p className="text-sm text-coral-ink">{t(state.errors.code[0])}</p>}
      {state.message && <p className="text-sm text-coral-ink" role="alert">{t(state.message)}</p>}
      <button type="submit" disabled={pending} className="min-h-11 w-full rounded-control bg-teal px-4 text-sm font-bold text-midnight disabled:opacity-60">
        {pending ? t("Joining…") : t("Join the programme")}
      </button>
    </form>
  );
}
