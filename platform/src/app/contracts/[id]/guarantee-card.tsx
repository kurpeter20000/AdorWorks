"use client";

import { useActionState, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { requestReplacement } from "@/lib/actions/guarantee";
import { GUARANTEE_REASONS, GUARANTEE_STATUS_LABEL, type GuaranteeReason } from "@/lib/domain/guarantee";
import { formatDate } from "@/lib/domain/format";
import { useT } from "@/i18n/client";

export interface GuaranteeState {
  windowEnds: string;
  remedy: string;
  contactName: string | null;
  request: { status: string; reason: string; createdAt: string; staffNote: string | null } | null;
}

/** Employer Guarantee on a contract (0120): window, status and Request replacement. Only rendered while the Guarantee is switched on. */
export function GuaranteeCard({ contractId, g }: { contractId: string; g: GuaranteeState }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(requestReplacement.bind(null, contractId), {});
  const windowOpen = new Date(g.windowEnds) >= new Date();
  const used = g.request && g.request.status !== "declined";

  return (
    <section className="mt-8 rounded-card border border-teal/25 bg-teal/5 p-5" aria-labelledby="guarantee-h">
      <h2 id="guarantee-h" className="flex items-center gap-2 font-bold text-midnight">
        <ShieldCheck className="size-5 text-teal-ink" aria-hidden="true" />
        {t("Employer Guarantee")}
      </h2>
      <p className="mt-1 text-sm text-midnight">
        {windowOpen
          ? t("Covered until {date}. If this placement doesn't work out for a covered reason: {remedy}", { date: formatDate(g.windowEnds), remedy: t(g.remedy) })
          : t("The Guarantee window ended on {date}.", { date: formatDate(g.windowEnds) })}
      </p>
      {g.contactName && <p className="mt-1 text-xs text-slate">{t("Your AdorWorks contact: {name}", { name: g.contactName })}</p>}

      {g.request ? (
        <div className="mt-3 rounded-lg bg-white px-3 py-2 text-sm">
          <p className="font-semibold text-midnight">{t(GUARANTEE_STATUS_LABEL[g.request.status] ?? g.request.status)}</p>
          <p className="text-xs text-slate">
            {t(GUARANTEE_REASONS[g.request.reason as GuaranteeReason] ?? g.request.reason)} · {formatDate(g.request.createdAt)}
          </p>
          {g.request.staffNote && <p className="mt-1 text-xs text-midnight">{g.request.staffNote}</p>}
        </div>
      ) : null}

      {windowOpen && !used && (
        "sent" in state && state.sent ? (
          <p className="mt-3 text-sm font-semibold text-teal-ink" role="status">
            {t("Request sent. Your AdorWorks contact will reply within 7 days.")}
          </p>
        ) : !open ? (
          <button type="button" onClick={() => setOpen(true)} className="mt-3 min-h-11 rounded-control border border-teal/40 bg-white px-4 text-sm font-bold text-teal-ink">
            {t("Request a replacement")}
          </button>
        ) : (
          <form action={action} className="mt-3 space-y-2">
            <fieldset>
              <legend className="text-sm font-semibold text-midnight">{t("What happened?")}</legend>
              <div className="mt-1 space-y-1">
                {(Object.keys(GUARANTEE_REASONS) as GuaranteeReason[]).map((r) => (
                  <label key={r} className="flex min-h-9 items-center gap-2 text-sm text-midnight">
                    <input type="radio" name="reason" value={r} required /> {t(GUARANTEE_REASONS[r])}
                  </label>
                ))}
              </div>
              {state.errors?.reason && <p className="text-xs text-coral-ink">{t(state.errors.reason[0])}</p>}
            </fieldset>
            <label className="block text-sm font-semibold text-midnight">
              {t("Tell us more")}
              <textarea name="details" required minLength={10} maxLength={2000} rows={3} className="mt-1 w-full rounded-control border border-slate/25 px-3 py-2 text-sm font-normal" />
            </label>
            {state.errors?.details && <p className="text-xs text-coral-ink">{t(state.errors.details[0])}</p>}
            {state.message && <p className="text-xs text-coral-ink" role="alert">{t(state.message)}</p>}
            <p className="text-xs text-slate">
              {t("Not covered: changes to the role, pay, location or duties; budget cuts; unpaid wages; or an ending the Labour Act prohibits. Workers never pay for a replacement.")}
            </p>
            <button type="submit" disabled={pending} className="min-h-11 rounded-control bg-teal px-4 text-sm font-bold text-midnight disabled:opacity-60">
              {pending ? t("Sending…") : t("Send request")}
            </button>
          </form>
        )
      )}
    </section>
  );
}
