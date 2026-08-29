"use client";

import { useActionState, useState } from "react";
import { fileReport } from "@/lib/actions/reports";
import type { ReportTargetType } from "@/lib/database.types";
import type { FormState } from "@/lib/actions/auth";

const REASON_LABEL: Record<string, string> = {
  spam: "Spam",
  scam: "Scam or fraud",
  inappropriate: "Inappropriate content",
  misleading: "Misleading or false information",
  other: "Other",
};

const initialState: FormState & { success?: boolean } = {};

/** Drop-in report action for a listing or profile — see lib/actions/reports.ts. */
export function ReportButton({ targetType, targetId }: { targetType: ReportTargetType; targetId: string }) {
  const [open, setOpen] = useState(false);
  const boundAction = fileReport.bind(null, targetType, targetId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  if (state.success) {
    return <p className="text-xs text-slate">Report submitted — thank you.</p>;
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-slate underline">
        Report
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-2 space-y-2 rounded-lg border border-slate/15 bg-cloud/40 p-3">
      <select name="reason" required defaultValue="" className="w-full rounded-lg border border-slate/25 px-2 py-1.5 text-xs">
        <option value="" disabled>
          Why are you reporting this?
        </option>
        {Object.entries(REASON_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {state.errors?.reason && <p className="text-xs text-coral-ink">{state.errors.reason[0]}</p>}
      <textarea
        name="note"
        rows={2}
        placeholder="Anything else staff should know? (optional)"
        className="w-full rounded-lg border border-slate/25 px-2 py-1.5 text-xs"
      />
      {state.message && <p className="text-xs text-coral-ink">{state.message}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-coral px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
        >
          {pending ? "Submitting…" : "Submit report"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-slate underline">
          Cancel
        </button>
      </div>
    </form>
  );
}
