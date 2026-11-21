"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { partnerCreateCohort } from "@/lib/actions/partnerProgrammes";
import { PROGRAMME_TYPES, type ProgrammeType } from "@/lib/domain/pathways";
import { useT } from "@/i18n/client";

const input = "mt-1 min-h-11 w-full rounded-control border border-slate/25 px-3 text-sm font-normal";

/** Partner organisation admins create their own cohorts (0124). */
export function NewCohortForm({ orgs }: { orgs: { id: string; name: string }[] }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(partnerCreateCohort, {});
  const createdId = "createdId" in state ? state.createdId : undefined;
  useEffect(() => {
    if (createdId) router.push(`/partner/${createdId}/team`);
  }, [createdId, router]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="min-h-11 rounded-control bg-teal px-4 text-sm font-bold text-midnight">
        {t("+ Create a cohort")}
      </button>
    );
  }
  return (
    <form action={action} className="grid gap-3 rounded-card border border-line bg-white p-5 shadow-card sm:grid-cols-2">
      {orgs.length === 1 ? (
        <input type="hidden" name="organisationId" value={orgs[0].id} />
      ) : (
        <label className="text-sm font-semibold text-midnight sm:col-span-2">
          {t("Organisation")}
          <select name="organisationId" className={input}>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="text-sm font-semibold text-midnight sm:col-span-2">
        {t("Cohort name")}
        <input name="name" required className={input} placeholder={t("e.g. Career Readiness — Juba, January 2027")} />
        {state.errors?.name && <span className="mt-1 block text-xs text-coral-ink">{t(state.errors.name[0])}</span>}
      </label>
      <label className="text-sm font-semibold text-midnight">
        {t("Programme")}
        <select name="programmeType" defaultValue="career_readiness" className={input}>
          {(Object.keys(PROGRAMME_TYPES) as ProgrammeType[]).map((k) => (
            <option key={k} value={k}>
              {t(PROGRAMME_TYPES[k])}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-semibold text-midnight">
        {t("Placement target (optional)")}
        <input name="targetPlaced" inputMode="numeric" className={input} />
        {state.errors?.targetPlaced && <span className="mt-1 block text-xs text-coral-ink">{t(state.errors.targetPlaced[0])}</span>}
      </label>
      <label className="text-sm font-semibold text-midnight">
        {t("Starts on")}
        <input name="startsOn" type="date" className={input} />
      </label>
      <label className="text-sm font-semibold text-midnight">
        {t("Ends on")}
        <input name="endsOn" type="date" className={input} />
      </label>
      <label className="text-sm font-semibold text-midnight">
        {t("Funder (optional)")}
        <input name="funder" className={input} />
      </label>
      <label className="text-sm font-semibold text-midnight">
        {t("Region (optional)")}
        <input name="region" className={input} placeholder={t("e.g. Juba")} />
      </label>
      {state.message && <p className="text-sm text-coral-ink sm:col-span-2">{t(state.message)}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className="min-h-11 rounded-control bg-teal px-4 text-sm font-bold text-midnight disabled:opacity-60">
          {pending ? t("Creating…") : t("Create cohort")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-3 text-sm font-semibold text-slate">
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}
