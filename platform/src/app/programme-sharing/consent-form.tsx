"use client";

import { useActionState } from "react";
import { saveProgrammeConsent } from "@/lib/actions/programmeConsent";
import { CONSENT_BOXES, type ConsentBox, type ConsentChoice } from "@/lib/domain/programmeConsent";
import { useT } from "@/i18n/client";

/** Screen 1 of the consent wording. Nothing pre-ticked unless the person ticked it before. */
export function ConsentForm({ programmeId, current }: { programmeId: string; current: ConsentChoice | null }) {
  const t = useT();
  const [state, action, pending] = useActionState(saveProgrammeConsent.bind(null, programmeId), {});
  return (
    <form action={action} className="mt-4 space-y-2">
      <p className="text-sm font-bold text-midnight">{t("Shared only if you tick the boxes below:")}</p>
      {(Object.keys(CONSENT_BOXES) as ConsentBox[]).map((k) => (
        <label key={k} className="flex min-h-11 items-start gap-3 rounded-control border border-line bg-white px-3 py-2.5 text-sm text-midnight">
          <input type="checkbox" name={k} defaultChecked={current?.[k] ?? false} className="mt-0.5 size-4 shrink-0 accent-teal" />
          {t(CONSENT_BOXES[k])}
        </label>
      ))}
      {state.message && (
        <p className="text-sm text-coral-ink" role="alert">
          {t(state.message)}
        </p>
      )}
      {"saved" in state && state.saved && (
        <p className="text-sm font-semibold text-teal-ink" role="status">
          {t("Your choices are saved. You can change them at any time.")}
        </p>
      )}
      <button type="submit" disabled={pending} className="min-h-11 rounded-control bg-teal px-5 text-sm font-bold text-midnight disabled:opacity-60">
        {pending ? t("Saving…") : t("Save my choices")}
      </button>
    </form>
  );
}
