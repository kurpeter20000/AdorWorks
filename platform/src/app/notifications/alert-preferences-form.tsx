"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { saveAlertPreferences, type AlertPrefsState } from "@/lib/actions/alertPreferences";
import type { AlertPreferencesRow } from "@/lib/database.types";
import { useT } from "@/i18n/client";

const noop = () => () => {};

/** Spec "channel and quiet hours editable in settings" (WhatsApp, 0114). */
export function AlertPreferencesForm({ current, whatsappLive }: { current: AlertPreferencesRow | null; whatsappLive: boolean }) {
  const t = useT();
  const [state, action, pending] = useActionState(saveAlertPreferences, {} as AlertPrefsState);
  const [whatsapp, setWhatsapp] = useState(current?.whatsapp_enabled ?? false);
  const [quiet, setQuiet] = useState(Boolean(current?.quiet_from));
  const box = "size-5 accent-[var(--color-primary)]";
  const row = "flex min-h-11 items-center gap-3 text-sm text-midnight";
  // The browser knows the person's timezone; quiet hours are in it.
  const browserTz = useSyncExternalStore(
    noop,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Juba",
    () => current?.timezone ?? "Africa/Juba"
  );
  const tz = browserTz;

  return (
    <form action={action} className="mt-6 space-y-3 rounded-card border border-line bg-white p-4 shadow-card">
      <h2 className="text-base font-extrabold text-midnight">{t("Alerts on your phone")}</h2>
      <input type="hidden" name="timezone" value={tz} />
      <label className={row}>
        <input type="checkbox" name="whatsapp_enabled" className={box} checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} />
        {t("Send me alerts on WhatsApp")}
      </label>
      {whatsapp && (
        <label className="block text-sm text-midnight">
          {t("WhatsApp number")}
          <input
            name="whatsapp_number"
            type="tel"
            inputMode="tel"
            defaultValue={current?.whatsapp_number ?? ""}
            placeholder="0912 345 678"
            className="mt-1 min-h-11 w-full rounded-control border border-slate/25 px-3 text-sm"
          />
        </label>
      )}
      {whatsapp && !whatsappLive && <p className="text-xs text-slate">{t("WhatsApp alerts are being set up. We'll start sending them as soon as they're ready.")}</p>}

      <fieldset className="space-y-1">
        <legend className="text-sm font-semibold text-midnight">{t("Alert me about")}</legend>
        <label className={row}>
          <input type="checkbox" name="application_updates" className={box} defaultChecked={current?.application_updates ?? true} />
          {t("My applications, offers, interviews and payments")}
        </label>
        <label className={row}>
          <input type="checkbox" name="messages" className={box} defaultChecked={current?.messages ?? true} />
          {t("New messages")}
        </label>
      </fieldset>

      <label className={row}>
        <input type="checkbox" name="quiet_enabled" className={box} checked={quiet} onChange={(e) => setQuiet(e.target.checked)} />
        {t("Quiet hours — no phone alerts at night")}
      </label>
      {quiet && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-midnight">
          <label>
            {t("From")}{" "}
            <input type="time" name="quiet_from" defaultValue={current?.quiet_from?.slice(0, 5) ?? "21:00"} className="min-h-11 rounded-control border border-slate/25 px-2" />
          </label>
          <label>
            {t("until")}{" "}
            <input type="time" name="quiet_until" defaultValue={current?.quiet_until?.slice(0, 5) ?? "07:00"} className="min-h-11 rounded-control border border-slate/25 px-2" />
          </label>
        </div>
      )}

      {state.message && (
        <p className="text-sm text-coral-ink" role="alert">
          {t(state.message)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="min-h-11 rounded-control bg-primary px-4 text-sm font-extrabold text-white hover:bg-primary-hover disabled:opacity-60">
          {pending ? t("Saving…") : t("Save")}
        </button>
        {state.saved && (
          <span className="text-sm text-teal-ink" role="status">
            {t("Saved.")}
          </span>
        )}
      </div>
    </form>
  );
}
