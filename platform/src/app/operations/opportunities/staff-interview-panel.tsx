"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { getStaffInterviewView, staffMessageApplicant } from "@/lib/actions/messages";
import { InterviewSlotsForm, type ExistingSlot } from "@/components/interview-slots-form";
import { inputClass } from "../_components/staff-ui";

type View = Awaited<ReturnType<typeof getStaffInterviewView>>;

/**
 * Staff-assisted hiring (0113 + owner decision): staff offer interview
 * times and message the applicant once they're shortlisted.
 */
export function StaffInterviewPanel({ applicationId }: { applicationId: string }) {
  const [view, setView] = useState<View | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const load = useCallback(() => getStaffInterviewView(applicationId).then(setView), [applicationId]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mt-2 space-y-2">
      {view && <InterviewSlotsForm applicationId={applicationId} existing={view.slots as ExistingSlot[]} onSent={load} />}
      <div className="rounded-lg border border-slate/15 p-3">
        <p className="text-xs font-semibold tracking-wide text-slate uppercase">Messages with the applicant</p>
        {view && view.messages.length === 0 && <p className="mt-1 text-sm text-slate">No messages yet.</p>}
        <ul className="mt-1 space-y-1">
          {view?.messages.map((m) => (
            <li key={m.id} className={`rounded px-2 py-1 text-sm ${m.fromTalent ? "bg-cloud" : "bg-teal/10"}`}>
              <span className="text-xs font-semibold text-slate">{m.fromTalent ? "Applicant" : "AdorWorks / employer"}: </span>
              {m.body}
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input aria-label="Message to the applicant" className={inputClass} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message the applicant…" />
          <button
            type="button"
            disabled={pending || body.trim().length === 0}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await staffMessageApplicant(applicationId, body.trim());
                if (r.error) setError(r.error);
                else {
                  setBody("");
                  await load();
                }
              })
            }
            className="min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-60"
          >
            Send
          </button>
        </div>
        {error && (
          <p className="mt-1 text-sm text-coral-ink" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
