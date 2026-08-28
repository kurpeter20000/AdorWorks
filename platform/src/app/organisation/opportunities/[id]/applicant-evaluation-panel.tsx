"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitScorecardScore } from "@/lib/actions/scorecards";
import { setInterviewDetails, addApplicationNote } from "@/lib/actions/applications";
import { SCORECARD_CRITERIA } from "@/lib/domain/scorecard";
import { ApplicationMessageThread } from "@/components/application-message-thread";
import type { FormState } from "@/lib/actions/auth";

const CRITERION_LABEL: Record<string, string> = {
  skill_fit: "Skill fit",
  communication: "Communication",
  portfolio_quality: "Portfolio quality",
  reliability: "Reliability",
};

interface ScoreRow {
  criterion: string;
  score: number;
  note: string | null;
  scored_by: string;
}

interface NoteRow {
  id: string;
  body: string;
  created_at: string;
  authorName: string;
}

interface MessageRow {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export function ApplicantEvaluationPanel({
  applicationId,
  opportunityId,
  myUserId,
  scores,
  notes,
  interviewScheduledAt,
  interviewNotes,
  messages,
}: {
  applicationId: string;
  opportunityId: string;
  myUserId: string;
  scores: ScoreRow[];
  notes: NoteRow[];
  interviewScheduledAt: string | null;
  interviewNotes: string | null;
  messages: MessageRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [noteState, setNoteState] = useState<FormState>({});

  const myScoreByCriterion = new Map(scores.filter((s) => s.scored_by === myUserId).map((s) => [s.criterion, s]));

  function averageFor(criterion: string) {
    const values = scores.filter((s) => s.criterion === criterion).map((s) => s.score);
    if (values.length === 0) return null;
    return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
  }

  function submitScore(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await submitScorecardScore(applicationId, opportunityId, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function submitInterview(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await setInterviewDetails(applicationId, opportunityId, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  async function submitNote(_prev: FormState, formData: FormData): Promise<FormState> {
    const result = await addApplicationNote(applicationId, opportunityId, _prev, formData);
    if (!result.message && !result.errors) router.refresh();
    return result;
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 text-xs font-semibold text-teal-ink underline">
        Evaluate
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-4 rounded-lg border border-slate/15 bg-cloud/40 p-3">
      <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-slate underline">
        Hide evaluation
      </button>

      <div>
        <p className="text-xs font-semibold text-midnight">Scorecard</p>
        <div className="mt-2 space-y-2">
          {SCORECARD_CRITERIA.map((criterion) => {
            const mine = myScoreByCriterion.get(criterion);
            return (
              <form key={criterion} action={submitScore} className="flex items-center gap-2">
                <input type="hidden" name="criterion" value={criterion} />
                <span className="w-32 shrink-0 text-xs text-midnight">{CRITERION_LABEL[criterion]}</span>
                <select name="score" defaultValue={mine?.score ?? ""} className="rounded-lg border border-slate/25 px-2 py-1 text-xs">
                  <option value="" disabled>
                    —
                  </option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-slate">avg {averageFor(criterion) ?? "—"}</span>
                <button type="submit" disabled={pending} className="text-xs font-semibold text-teal-ink underline disabled:opacity-60">
                  Save
                </button>
              </form>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-midnight">Interview</p>
        <form action={submitInterview} className="mt-2 space-y-2">
          <input
            type="datetime-local"
            name="interviewScheduledAt"
            defaultValue={interviewScheduledAt ? interviewScheduledAt.slice(0, 16) : ""}
            className="w-full rounded-lg border border-slate/25 px-2 py-1.5 text-xs"
          />
          <textarea
            name="interviewNotes"
            rows={2}
            defaultValue={interviewNotes ?? ""}
            placeholder="Interview notes"
            className="w-full rounded-lg border border-slate/25 px-2 py-1.5 text-xs"
          />
          <button type="submit" disabled={pending} className="rounded-lg bg-teal px-3 py-1.5 text-xs font-bold text-midnight disabled:opacity-60">
            Save interview details
          </button>
        </form>
      </div>

      <div>
        <p className="text-xs font-semibold text-midnight">Team notes</p>
        <ul className="mt-2 space-y-2">
          {notes.length === 0 && <li className="text-xs text-slate">No notes yet.</li>}
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg bg-white p-2 text-xs">
              <p className="text-midnight">{n.body}</p>
              <p className="mt-1 text-slate">
                {n.authorName} · {new Date(n.created_at).toLocaleDateString()}
              </p>
            </li>
          ))}
        </ul>
        <form
          action={async (formData: FormData) => {
            const result = await submitNote(noteState, formData);
            setNoteState(result);
          }}
          className="mt-2 space-y-1"
        >
          <textarea name="body" rows={2} placeholder="Add a note for your team" className="w-full rounded-lg border border-slate/25 px-2 py-1.5 text-xs" />
          {noteState.errors?.body && <p className="text-xs text-coral">{noteState.errors.body[0]}</p>}
          {noteState.message && <p className="text-xs text-coral">{noteState.message}</p>}
          <button type="submit" className="rounded-lg border border-slate/25 px-3 py-1.5 text-xs font-semibold text-midnight">
            Add note
          </button>
        </form>
      </div>

      <div>
        <p className="text-xs font-semibold text-midnight">Message candidate</p>
        <p className="mb-2 text-[11px] text-slate">Visible to the candidate — not the same as team notes above.</p>
        <ApplicationMessageThread applicationId={applicationId} currentUserId={myUserId} messages={messages} />
      </div>

      {error && <p className="text-xs text-coral">{error}</p>}
    </div>
  );
}
