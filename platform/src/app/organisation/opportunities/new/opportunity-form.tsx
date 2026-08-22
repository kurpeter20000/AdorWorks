"use client";

import { useActionState } from "react";
import { createOpportunity } from "@/lib/actions/organisation";
import type { FormState } from "@/lib/actions/auth";

const initialState: FormState = {};

export function OpportunityForm({ organisationId }: { organisationId: string }) {
  const boundAction = createOpportunity.bind(null, organisationId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label htmlFor="title" className="text-sm font-semibold text-midnight">
          Title
        </label>
        <input
          id="title"
          name="title"
          required
          placeholder="e.g. Graphic designer for a 2-month brand refresh"
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        {state.errors?.title && <p className="mt-1 text-sm text-coral">{state.errors.title[0]}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="type" className="text-sm font-semibold text-midnight">
            Type
          </label>
          <select
            id="type"
            name="type"
            required
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
        <label htmlFor="brief" className="text-sm font-semibold text-midnight">
          Brief
        </label>
        <textarea
          id="brief"
          name="brief"
          rows={4}
          placeholder="What needs doing, the outcome you want, anything a good applicant should know."
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="skills" className="text-sm font-semibold text-midnight">
          Required skills <span className="font-normal text-slate">(comma-separated)</span>
        </label>
        <input
          id="skills"
          name="skills"
          required
          placeholder="e.g. Figma, brand identity, illustration"
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        {state.errors?.skills && <p className="mt-1 text-sm text-coral">{state.errors.skills[0]}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="location" className="text-sm font-semibold text-midnight">
            Location <span className="font-normal text-slate">(optional)</span>
          </label>
          <input
            id="location"
            name="location"
            className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="workMode" className="text-sm font-semibold text-midnight">
            Work mode
          </label>
          <select
            id="workMode"
            name="workMode"
            className="mt-1 w-full rounded-lg border border-slate/25 px-2 py-2 text-sm"
            defaultValue="any"
          >
            <option value="remote">Remote</option>
            <option value="on_site">On-site</option>
            <option value="hybrid">Hybrid</option>
            <option value="any">Any</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="engagementType" className="text-sm font-semibold text-midnight">
          Engagement type
        </label>
        <select
          id="engagementType"
          name="engagementType"
          required
          className="mt-1 w-full rounded-lg border border-slate/25 px-2 py-2 text-sm"
        >
          <option value="freelance">Freelance</option>
          <option value="fixed_term_contract">Fixed-term contract</option>
          <option value="full_time">Full-time</option>
          <option value="internship">Internship</option>
          <option value="apprenticeship">Apprenticeship</option>
          <option value="managed_service">Managed service</option>
        </select>
        {state.errors?.engagementType && (
          <p className="mt-1 text-sm text-coral">{state.errors.engagementType[0]}</p>
        )}
      </div>

      <div className="rounded-xl border border-slate/15 bg-cloud p-4">
        <p className="text-sm font-semibold text-midnight">Compensation</p>
        <p className="mt-1 text-xs text-slate">
          AdorWorks only lists paid opportunities. Enter a fixed amount, or a range.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="paymentBasis" className="text-xs font-semibold text-midnight">
              Paid
            </label>
            <select
              id="paymentBasis"
              name="paymentBasis"
              required
              className="mt-1 w-full rounded-lg border border-slate/25 px-2 py-2 text-sm"
            >
              <option value="fixed">Fixed price</option>
              <option value="milestone">Per milestone</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="monthly">Monthly</option>
              <option value="negotiable">Negotiable</option>
            </select>
          </div>
          <div>
            <label htmlFor="currency" className="text-xs font-semibold text-midnight">
              Currency
            </label>
            <input
              id="currency"
              name="currency"
              defaultValue="SSP"
              className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="compensationAmount" className="text-xs font-semibold text-midnight">
              Amount
            </label>
            <input
              id="compensationAmount"
              name="compensationAmount"
              type="number"
              min="0"
              step="0.01"
              className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="compensationMin" className="text-xs font-semibold text-midnight">
              Or min
            </label>
            <input
              id="compensationMin"
              name="compensationMin"
              type="number"
              min="0"
              step="0.01"
              className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="compensationMax" className="text-xs font-semibold text-midnight">
              Max
            </label>
            <input
              id="compensationMax"
              name="compensationMax"
              type="number"
              min="0"
              step="0.01"
              className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
            />
          </div>
        </div>
        {state.errors?.compensationAmount && (
          <p className="mt-2 text-sm text-coral">{state.errors.compensationAmount[0]}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="applicationDeadline" className="text-sm font-semibold text-midnight">
            Apply by <span className="font-normal text-slate">(optional)</span>
          </label>
          <input
            id="applicationDeadline"
            name="applicationDeadline"
            type="date"
            className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="numberOfOpenings" className="text-sm font-semibold text-midnight">
            Number of openings
          </label>
          <input
            id="numberOfOpenings"
            name="numberOfOpenings"
            type="number"
            min="1"
            defaultValue={1}
            className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {state.message && <p className="text-sm text-coral">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-violet px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit for review"}
      </button>
    </form>
  );
}
