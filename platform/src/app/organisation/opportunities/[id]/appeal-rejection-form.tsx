"use client";

import { useActionState } from "react";
import { appealOpportunityRejection } from "@/lib/actions/organisation";
import type { FormState } from "@/lib/actions/auth";

const initialState: FormState = {};

export function AppealRejectionForm({ opportunityId }: { opportunityId: string }) {
  const boundAction = appealOpportunityRejection.bind(null, opportunityId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <label htmlFor="appeal-note" className="text-xs font-semibold text-midnight">
        Think this was a mistake? Explain why and AdorWorks staff will take another look.
      </label>
      <textarea
        id="appeal-note"
        name="note"
        required
        rows={3}
        className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
      />
      {state.errors?.note && <p className="text-xs text-coral">{state.errors.note[0]}</p>}
      {state.message && <p className="text-xs text-coral">{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-violet px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit appeal"}
      </button>
    </form>
  );
}
