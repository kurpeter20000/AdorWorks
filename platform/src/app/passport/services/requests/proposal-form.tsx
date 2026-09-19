"use client";

import { useActionState } from "react";
import { submitServiceProposal } from "@/lib/actions/serviceRequests";
import type { FormState } from "@/lib/actions/auth";

const initialState: FormState = {};

/** S09-04: the talent's proposal in response to a request — see submitServiceProposal. */
export function ProposalForm({ serviceRequestId }: { serviceRequestId: string }) {
  const boundAction = submitServiceProposal.bind(null, serviceRequestId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className="space-y-2 rounded-lg border border-slate/15 bg-cloud/40 p-3">
      <p className="text-xs font-semibold text-midnight">Send a proposal</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`price-${serviceRequestId}`} className="text-xs text-slate">
            Price
          </label>
          <input
            id={`price-${serviceRequestId}`}
            name="price"
            type="number"
            min="1"
            required
            className="mt-1 w-full rounded-lg border border-slate/25 px-2 py-1.5 text-sm"
          />
          {state.errors?.price && <p className="mt-1 text-xs text-coral-ink">{state.errors.price[0]}</p>}
        </div>
        <div>
          <label htmlFor={`timeline-${serviceRequestId}`} className="text-xs text-slate">
            Timeline (days)
          </label>
          <input
            id={`timeline-${serviceRequestId}`}
            name="timelineDays"
            type="number"
            min="1"
            step="1"
            required
            className="mt-1 w-full rounded-lg border border-slate/25 px-2 py-1.5 text-sm"
          />
          {state.errors?.timelineDays && <p className="mt-1 text-xs text-coral-ink">{state.errors.timelineDays[0]}</p>}
        </div>
      </div>
      <input type="hidden" name="currency" value="SSP" />
      <div>
        <label htmlFor={`message-${serviceRequestId}`} className="text-xs text-slate">
          Message (optional)
        </label>
        <textarea
          id={`message-${serviceRequestId}`}
          name="message"
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate/25 px-2 py-1.5 text-sm"
        />
      </div>
      {state.message && <p className="text-xs text-coral-ink" role="alert">{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-teal px-3 py-1.5 text-xs font-bold text-midnight disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send proposal"}
      </button>
    </form>
  );
}
