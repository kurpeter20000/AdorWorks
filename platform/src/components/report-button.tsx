"use client";

import { useActionState, useState } from "react";
import { fileReport } from "@/lib/actions/reports";
import { CONTACT_URL } from "@/lib/domain/marketingSite";
import type { ReportTargetType } from "@/lib/database.types";
import type { FormState } from "@/lib/actions/auth";
import { msg } from "@/i18n/config";
import { useT } from "@/i18n/client";
import { rich } from "@/i18n/rich";

const REASON_LABEL: Record<string, string> = {
  spam: msg("Spam"),
  scam: msg("Scam or fraud"),
  inappropriate: msg("Inappropriate content"),
  misleading: msg("Misleading or false information"),
  // S10-10: routed to admin-only visibility server-side (0084) — a
  // regular staff role literally can't see one of these, not just a UI
  // choice not to show it to them.
  safeguarding: msg("Safety concern — exploitation, abuse, or harassment"),
  other: msg("Other"),
};

const initialState: FormState & { success?: boolean } = {};

/** Drop-in report action for a listing or profile — see lib/actions/reports.ts. */
export function ReportButton({ targetType, targetId }: { targetType: ReportTargetType; targetId: string }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const boundAction = fileReport.bind(null, targetType, targetId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  if (state.success) {
    return (
      <p className="text-xs text-slate" role="status">
        {rich(t("Report submitted — thank you. If this is urgent, you can also <contact>contact us directly</contact>."), {
          contact: (text) => (
            <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-teal-ink underline">
              {text}
            </a>
          ),
        })}
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-slate underline">
        {t("Report")}
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-2 space-y-2 rounded-lg border border-slate/15 bg-cloud/40 p-3">
      <select name="reason" required defaultValue="" className="w-full rounded-lg border border-slate/25 px-2 py-1.5 text-xs">
        <option value="" disabled>
          {t("Why are you reporting this?")}
        </option>
        {Object.entries(REASON_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {t(label)}
          </option>
        ))}
      </select>
      {state.errors?.reason && <p className="text-xs text-coral-ink">{t(state.errors.reason[0])}</p>}
      <textarea
        name="note"
        rows={2}
        placeholder={t("Anything else staff should know? (optional)")}
        className="w-full rounded-lg border border-slate/25 px-2 py-1.5 text-xs"
      />
      {state.message && <p className="text-xs text-coral-ink" role="alert">{t(state.message)}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-coral-ink px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
        >
          {pending ? t("Submitting…") : t("Submit report")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-slate underline">
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}
