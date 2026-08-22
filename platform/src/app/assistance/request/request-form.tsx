"use client";

import { useActionState } from "react";
import { submitAssistanceRequest } from "@/lib/actions/assistance";
import type { FormState } from "@/lib/actions/auth";

const initialState: FormState = {};

export function RequestForm() {
  const [state, formAction, pending] = useActionState(submitAssistanceRequest, initialState);

  // submitAssistanceRequest returns {} on success, same shape as
  // initialState — the reference check is what distinguishes "just
  // submitted, nothing went wrong" from "never submitted yet".
  const submitted = state !== initialState && !state.errors && !state.message;

  if (submitted) {
    return (
      <p className="mt-6 rounded-lg bg-teal/10 px-4 py-3 text-sm font-semibold text-teal">
        Request sent — AdorWorks staff will be in touch to arrange help.
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label htmlFor="reason" className="text-sm font-semibold text-midnight">
          What do you need help with?
        </label>
        <textarea
          id="reason"
          name="reason"
          rows={3}
          required
          placeholder="e.g. I don't have a smartphone and need help signing up"
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        {state.errors?.reason && <p className="mt-1 text-sm text-coral">{state.errors.reason[0]}</p>}
      </div>

      <div>
        <label htmlFor="preferredChannel" className="text-sm font-semibold text-midnight">
          Best way to reach you <span className="font-normal text-slate">(optional)</span>
        </label>
        <input
          id="preferredChannel"
          name="preferredChannel"
          placeholder="e.g. phone number, or a nearby partner hub"
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
      </div>

      {state.message && <p className="text-sm text-coral">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-bold text-midnight disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}
