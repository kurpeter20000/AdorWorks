"use client";

import { useActionState, useTransition } from "react";
import { createSession, issueCertificateByPhone, markAttendanceByPhone, setCheckinOpen } from "@/lib/actions/pathwaysSessions";
import { useT } from "@/i18n/client";

const input = "min-h-11 w-full rounded-control border border-slate/25 px-3 text-sm";

export function NewSessionForm({ programmeId }: { programmeId: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(createSession.bind(null, programmeId), {});
  return (
    <form action={action} className="grid gap-3 rounded-card border border-line bg-white p-4 sm:grid-cols-3">
      <label className="text-sm font-semibold text-midnight">
        {t("Session title")}
        <input name="title" required className={`${input} mt-1 font-normal`} placeholder={t("e.g. CV and job search")} />
        {state.errors?.title && <span className="mt-1 block text-xs text-coral-ink">{t(state.errors.title[0])}</span>}
      </label>
      <label className="text-sm font-semibold text-midnight">
        {t("Date and time")}
        <input name="startsAt" type="datetime-local" required className={`${input} mt-1 font-normal`} />
        {state.errors?.startsAt && <span className="mt-1 block text-xs text-coral-ink">{t(state.errors.startsAt[0])}</span>}
      </label>
      <label className="text-sm font-semibold text-midnight">
        {t("Place")}
        <input name="location" className={`${input} mt-1 font-normal`} placeholder={t("e.g. EduPower hall, Juba")} />
      </label>
      {state.message && <p className="text-sm text-coral-ink sm:col-span-3">{t(state.message)}</p>}
      {"saved" in state && state.saved && <p className="text-sm text-teal-ink sm:col-span-3">{t("Session added.")}</p>}
      <button type="submit" disabled={pending} className="min-h-11 rounded-control bg-teal px-4 text-sm font-bold text-midnight disabled:opacity-60 sm:col-span-3 sm:justify-self-start">
        {pending ? t("Saving…") : t("Add session")}
      </button>
    </form>
  );
}

export function CheckinToggle({ sessionId, open }: { sessionId: string; open: boolean }) {
  const t = useT();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => void (await setCheckinOpen(sessionId, !open)))}
      className="min-h-11 rounded-control border border-slate/30 px-3 text-sm font-bold text-midnight disabled:opacity-60"
    >
      {open ? t("Close check-in") : t("Reopen check-in")}
    </button>
  );
}

export function MarkByPhone({ sessionId }: { sessionId: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(markAttendanceByPhone.bind(null, sessionId), {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="text-xs font-semibold text-midnight">
        {t("Mark present by phone")}
        <input name="phone" type="tel" inputMode="tel" required placeholder="0912 345 678" className="mt-1 block min-h-11 w-48 rounded-control border border-slate/25 px-3 text-sm font-normal" />
      </label>
      <button type="submit" disabled={pending} className="min-h-11 rounded-control border border-slate/30 px-3 text-sm font-bold text-midnight disabled:opacity-60">
        {pending ? t("Saving…") : t("Mark present")}
      </button>
      {state.errors?.phone && <span className="w-full text-xs text-coral-ink">{t(state.errors.phone[0])}</span>}
      {state.message && <span className="w-full text-xs text-coral-ink">{t(state.message)}</span>}
      {"saved" in state && state.saved && <span className="w-full text-xs text-teal-ink">{t("Marked present.")}</span>}
    </form>
  );
}

export function IssueCertificate({ programmeId }: { programmeId: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(issueCertificateByPhone.bind(null, programmeId), {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="text-sm font-semibold text-midnight">
        {t("Participant's phone number")}
        <input name="phone" type="tel" inputMode="tel" required placeholder="0912 345 678" className="mt-1 block min-h-11 w-56 rounded-control border border-slate/25 px-3 text-sm font-normal" />
      </label>
      <button type="submit" disabled={pending} className="min-h-11 rounded-control bg-teal px-4 text-sm font-bold text-midnight disabled:opacity-60">
        {pending ? t("Issuing…") : t("Issue certificate")}
      </button>
      {state.errors?.phone && <span className="w-full text-xs text-coral-ink">{t(state.errors.phone[0])}</span>}
      {state.message && <span className="w-full text-xs text-coral-ink">{t(state.message)}</span>}
      {"code" in state && state.code && (
        <span className="w-full text-sm text-teal-ink">
          {t("Certificate issued. Check code: {code}", { code: state.code })}
        </span>
      )}
    </form>
  );
}
