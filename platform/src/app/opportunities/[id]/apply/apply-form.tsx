"use client";

import { useActionState } from "react";
import { applyToOpportunity } from "@/lib/actions/applications";
import type { FormState } from "@/lib/actions/auth";

const initialState: FormState = {};

export function ApplyForm({
  opportunityId,
  questions,
}: {
  opportunityId: string;
  questions: { id: string; question: string; required: boolean }[];
}) {
  const boundAction = applyToOpportunity.bind(null, opportunityId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label htmlFor="pitch" className="text-sm font-semibold text-midnight">
          Why are you a fit for this?
        </label>
        <textarea
          id="pitch"
          name="pitch"
          rows={5}
          required
          placeholder="Share relevant experience, how you'd approach this, or anything that sets you apart."
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        {state.errors?.pitch && <p className="mt-1 text-sm text-coral-ink">{state.errors.pitch[0]}</p>}
      </div>

      {questions.length > 0 && (
        <div className="space-y-4 rounded-xl border border-slate/15 bg-cloud p-4">
          <p className="text-sm font-semibold text-midnight">Screening questions</p>
          {questions.map((q) => (
            <div key={q.id}>
              <label htmlFor={`answer-${q.id}`} className="text-sm text-midnight">
                {q.question} {q.required && <span className="text-coral-ink">*</span>}
              </label>
              <input
                id={`answer-${q.id}`}
                name={`answer-${q.id}`}
                required={q.required}
                className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
              />
              {state.errors?.[`answer-${q.id}`] && (
                <p className="mt-1 text-sm text-coral-ink">{state.errors[`answer-${q.id}`][0]}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {state.message && <p className="text-sm text-coral-ink">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-bold text-midnight disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit application"}
      </button>
    </form>
  );
}
