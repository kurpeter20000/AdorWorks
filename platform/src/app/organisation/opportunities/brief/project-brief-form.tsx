"use client";

import { useActionState } from "react";
import { createProjectBrief } from "@/lib/actions/organisation";
import type { FormState } from "@/lib/actions/auth";

const initialState: FormState = {};

export function ProjectBriefForm({ organisationId }: { organisationId: string }) {
  const boundAction = createProjectBrief.bind(null, organisationId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label htmlFor="outcome" className="text-sm font-semibold text-midnight">
          What outcome are you looking for?
        </label>
        <textarea
          id="outcome"
          name="outcome"
          required
          rows={4}
          placeholder="e.g. I need our brand refreshed across our website and social channels before our product launch in October."
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        {state.errors?.outcome && <p className="mt-1 text-sm text-coral">{state.errors.outcome[0]}</p>}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="type" className="text-sm font-semibold text-midnight">
            Roughly, what kind of engagement?
          </label>
          <select
            id="type"
            name="type"
            required
            defaultValue="project"
            className="mt-1 w-full rounded-lg border border-slate/25 px-2 py-2 text-sm"
          >
            <option value="project">Project</option>
            <option value="service">Service</option>
            <option value="contract">Contract</option>
            <option value="full_time">Full-time role</option>
            <option value="squad">Squad / team</option>
          </select>
        </div>
        <div>
          <label htmlFor="category" className="text-sm font-semibold text-midnight">
            Category
          </label>
          <select
            id="category"
            name="category"
            required
            className="mt-1 w-full rounded-lg border border-slate/25 px-2 py-2 text-sm"
          >
            <option value="creative_media">Creative &amp; media</option>
            <option value="digital_technology">Digital &amp; technology</option>
            <option value="business_project_support">Business &amp; project support</option>
          </select>
          {state.errors?.category && <p className="mt-1 text-sm text-coral">{state.errors.category[0]}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="roughBudget" className="text-sm font-semibold text-midnight">
          Rough budget <span className="font-normal text-slate">(optional — you can firm this up later)</span>
        </label>
        <input
          id="roughBudget"
          name="roughBudget"
          type="number"
          min="0"
          step="0.01"
          placeholder="SSP"
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
      </div>

      {state.message && <p className="text-sm text-coral">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-violet px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save brief and continue"}
      </button>
    </form>
  );
}
