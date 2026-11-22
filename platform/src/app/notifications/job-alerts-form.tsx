"use client";

import { useActionState, useState } from "react";
import { saveJobAlerts, type AlertPrefsState } from "@/lib/actions/alertPreferences";
import type { AlertPreferencesRow } from "@/lib/database.types";
import { categoryOptions, engagementTypeOptions, workModeOptions } from "@/lib/domain/taxonomy";
import { useT } from "@/i18n/client";

/** A checkbox styled as a tappable chip. */
function Chip({ name, value, label, checked }: { name: string; value: string; label: string; checked: boolean }) {
  return (
    <label className="cursor-pointer">
      <input type="checkbox" name={name} value={value} defaultChecked={checked} className="peer sr-only" />
      <span className="inline-flex min-h-10 items-center rounded-full border border-slate/25 bg-white px-3.5 text-sm font-semibold text-midnight transition peer-checked:border-primary peer-checked:bg-primary peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2">
        {label}
      </span>
    </label>
  );
}

/**
 * Tailored job alerts (0126), talent only. Off until switched on; every
 * filter left empty means "any". With no field or keywords chosen, the
 * talent's own profile field and skills are used.
 */
export function JobAlertsForm({ current }: { current: AlertPreferencesRow | null }) {
  const t = useT();
  const [state, action, pending] = useActionState(saveJobAlerts, {} as AlertPrefsState);
  const [enabled, setEnabled] = useState(current?.job_alerts_enabled ?? false);
  const has = (list: string[] | undefined, v: string) => (list ?? []).includes(v);
  const legend = "text-sm font-bold text-midnight";
  const hint = "mt-0.5 text-xs text-slate text-pretty";
  const input = "mt-1.5 min-h-11 w-full rounded-control border border-slate/25 px-3 text-sm";

  return (
    <form id="job-alerts" action={action} className="mt-6 scroll-mt-20 space-y-4 rounded-card border border-line bg-white p-4 shadow-card sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-extrabold text-midnight">{t("Job alerts")}</h2>
          <p className="mt-0.5 text-sm text-slate text-pretty">{t("Hear about new jobs in your field the moment they're published.")}</p>
        </div>
        <label className="relative inline-flex shrink-0 cursor-pointer items-center">
          <input
            type="checkbox"
            name="job_alerts_enabled"
            className="peer sr-only"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            aria-label={t("Send me job alerts")}
          />
          <span className="h-7 w-12 rounded-full bg-slate/30 transition peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2" />
          <span className="absolute start-1 top-1 size-5 rounded-full bg-white shadow transition peer-checked:translate-x-5 rtl:peer-checked:-translate-x-5" />
        </label>
      </div>

      {/* Kept in the form while switched off, so turning alerts off keeps the choices. */}
      <div className={enabled ? "space-y-4" : "hidden"}>
        <fieldset>
          <legend className={legend}>{t("Fields")}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {categoryOptions().map(([value, label]) => (
              <Chip key={value} name="job_alert_categories" value={value} label={t(label)} checked={has(current?.job_alert_categories, value)} />
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className={legend}>{t("Skills or keywords")}</span>
          <input
            name="job_alert_keywords"
            defaultValue={(current?.job_alert_keywords ?? []).join(", ")}
            placeholder={t("e.g. logo design, Figma, data collection")}
            className={input}
          />
          <span className={`block ${hint}`}>{t("Separate with commas. We alert you when a job mentions any of them.")}</span>
        </label>

        <fieldset>
          <legend className={legend}>{t("Kind of work")}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {engagementTypeOptions().map(([value, label]) => (
              <Chip key={value} name="job_alert_engagement_types" value={value} label={t(label)} checked={has(current?.job_alert_engagement_types, value)} />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className={legend}>{t("Work mode")}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {workModeOptions()
              .filter(([value]) => value !== "any")
              .map(([value, label]) => (
                <Chip key={value} name="job_alert_work_modes" value={value} label={t(label)} checked={has(current?.job_alert_work_modes, value)} />
              ))}
          </div>
        </fieldset>

        <label className="block">
          <span className={legend}>{t("Places")}</span>
          <input
            name="job_alert_locations"
            defaultValue={(current?.job_alert_locations ?? []).join(", ")}
            placeholder={t("e.g. Juba, Wau, Central Equatoria")}
            className={input}
          />
          <span className={`block ${hint}`}>{t("For on-site and hybrid work. Remote jobs reach you wherever you are.")}</span>
        </label>

        <label className="flex min-h-11 items-center gap-3 text-sm text-midnight">
          <input type="checkbox" name="job_alert_email" className="size-5 accent-[var(--color-primary)]" defaultChecked={current?.job_alert_email ?? true} />
          {t("Email me too")}
        </label>

        <p className="rounded-control bg-cloud px-3 py-2 text-xs text-slate text-pretty">
          {t("Leave a section empty to mean any. If you choose no fields or keywords, we use the field and skills on your Passport.")}
        </p>
      </div>

      {state.message && (
        <p className="text-sm text-coral-ink" role="alert">
          {t(state.message)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="min-h-11 rounded-control bg-primary px-4 text-sm font-extrabold text-white hover:bg-primary-hover disabled:opacity-60">
          {pending ? t("Saving…") : t("Save job alerts")}
        </button>
        {state.saved && (
          <span className="text-sm text-teal-ink" role="status">
            {enabled ? t("Saved. Job alerts are on.") : t("Saved. Job alerts are off.")}
          </span>
        )}
      </div>
    </form>
  );
}
