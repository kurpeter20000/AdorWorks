"use client";

import { useState, useTransition } from "react";
import { saveReviewerNote } from "@/lib/actions/shortlists";

/** Staff: the "why this person" note the employer sees on the shortlist (0119). */
export function ReviewerNote({ applicationId, initial, locked }: { applicationId: string; initial: string | null; locked: boolean }) {
  const [note, setNote] = useState(initial ?? "");
  const [saved, setSaved] = useState(initial ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (locked) {
    return initial ? <p className="mt-2 rounded-lg bg-cloud px-3 py-2 text-xs text-midnight">Reviewer note: {initial}</p> : null;
  }

  return (
    <div className="mt-2">
      <label className="block text-xs font-semibold text-midnight" htmlFor={`note-${applicationId}`}>
        Reviewer note for the employer <span className="font-normal text-slate">(why this person — shown on the shortlist)</span>
      </label>
      <textarea
        id={`note-${applicationId}`}
        value={note}
        maxLength={600}
        rows={2}
        onChange={(e) => setNote(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate/25 px-2 py-1.5 text-xs"
        placeholder="e.g. Delivered two NGO brand launches; strong Figma portfolio; available from 1 Dec."
      />
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || note.trim() === saved.trim()}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await saveReviewerNote(applicationId, note);
              if (r.error) setError(r.error);
              else setSaved(note);
            })
          }
          className="rounded-lg border border-slate/25 px-2.5 py-1 text-xs font-bold text-midnight disabled:opacity-50"
        >
          {pending ? "Saving…" : note.trim() === saved.trim() && saved ? "Saved" : "Save note"}
        </button>
        {!saved.trim() && <span className="text-xs text-coral-ink">Needed before sending</span>}
        {error && <span className="text-xs text-coral-ink">{error}</span>}
      </div>
    </div>
  );
}
