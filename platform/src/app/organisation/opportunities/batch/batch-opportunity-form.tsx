"use client";

import { useActionState, useState } from "react";
import { createOpportunitiesBatch } from "@/lib/actions/organisation";
import type { FormState } from "@/lib/actions/auth";
import { categoryOptions, engagementTypeOptions, paymentBasisOptions, workModeOptions } from "@/lib/domain/taxonomy";

const initialState: FormState = {};
const MAX_ROWS = 10;

const TYPE_LABEL: Record<string, string> = {
  service: "Service",
  project: "Project",
  contract: "Contract",
  full_time: "Full-time role",
  squad: "Talent squad",
};

export function BatchOpportunityForm({ organisationId }: { organisationId: string }) {
  const boundAction = createOpportunitiesBatch.bind(null, organisationId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const [rowCount, setRowCount] = useState(3);
  const input = "mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm";
  const label = "text-sm font-semibold text-midnight";

  return (
    <form action={formAction} className="mt-6 space-y-6">
      <section className="rounded-xl border border-slate/15 bg-white p-4">
        <h2 className="font-bold text-midnight">Shared settings</h2>
        <p className="mt-1 text-xs text-slate">Applied to every role below.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Type
            <select name="type" required defaultValue="project" className={input}>
              {Object.entries(TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Category
            <select name="category" required defaultValue="" className={input}>
              <option value="" disabled>
                Choose a category
              </option>
              {categoryOptions().map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Work mode
            <select name="workMode" required defaultValue="remote" className={input}>
              {workModeOptions().map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Engagement type
            <select name="engagementType" required defaultValue="freelance" className={input}>
              {engagementTypeOptions().map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Payment basis
            <select name="paymentBasis" required defaultValue="fixed" className={input}>
              {paymentBasisOptions().map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Currency
            <input name="currency" defaultValue="SSP" required className={input} />
          </label>
          <label className={label}>
            Application deadline <span className="font-normal text-slate">(optional)</span>
            <input name="applicationDeadline" type="date" className={input} />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-slate/15 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-midnight">Roles</h2>
          {rowCount < MAX_ROWS && (
            <button type="button" onClick={() => setRowCount((n) => n + 1)} className="text-xs font-semibold text-violet underline">
              Add another role
            </button>
          )}
        </div>
        <div className="mt-3 space-y-4">
          {Array.from({ length: rowCount }).map((_, i) => (
            <div key={i} className="rounded-lg border border-slate/15 bg-cloud/40 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate">Role {i + 1}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs font-semibold text-midnight sm:col-span-2">
                  Title
                  <input name={`title_${i}`} placeholder="e.g. Field Officer — Bentiu" className={input} />
                </label>
                <label className="text-xs font-semibold text-midnight">
                  Skills <span className="font-normal text-slate">(comma-separated)</span>
                  <input name={`skills_${i}`} placeholder="e.g. community liaison, reporting" className={input} />
                </label>
                <label className="text-xs font-semibold text-midnight">
                  Location <span className="font-normal text-slate">(optional)</span>
                  <input name={`location_${i}`} className={input} />
                </label>
                <label className="text-xs font-semibold text-midnight">
                  Amount
                  <input name={`compensationAmount_${i}`} type="number" min="0" step="0.01" className={input} />
                </label>
              </div>
            </div>
          ))}
        </div>
      </section>

      {state.message && <p className="text-sm text-coral-ink" role="alert">{state.message}</p>}

      <button type="submit" disabled={pending} className="w-full rounded-lg bg-violet px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
        {pending ? "Submitting…" : "Submit all for review"}
      </button>
    </form>
  );
}
