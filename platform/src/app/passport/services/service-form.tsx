"use client";

import { useActionState, useEffect } from "react";
import { createService, updateService, type ServiceFormState } from "@/lib/actions/services";
import type { TalentServiceRow } from "@/lib/database.types";
import { categoryOptions, paymentBasisOptions } from "@/lib/domain/taxonomy";

const initialState: ServiceFormState = {};

export function ServiceForm({
  existing,
  onSaved,
}: {
  existing?: TalentServiceRow;
  onSaved?: () => void;
}) {
  const action = existing ? updateService.bind(null, existing.id) : createService;
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.success) onSaved?.();
    // Only re-run when a fresh successful submission comes back — onSaved
    // itself is a fresh closure every render and must not be a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="mt-3 space-y-3 rounded-lg border border-slate/15 bg-cloud/40 p-3">
      <div>
        <label className="text-xs font-semibold text-midnight">Title</label>
        <input
          name="title"
          required
          defaultValue={existing?.title}
          placeholder="e.g. Brand logo design"
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        {state.errors?.title && <p className="mt-1 text-xs text-coral-ink">{state.errors.title[0]}</p>}
      </div>

      <div>
        <label className="text-xs font-semibold text-midnight">Category</label>
        <select
          name="category"
          defaultValue={existing?.category ?? ""}
          className="mt-1 w-full rounded-lg border border-slate/25 px-2 py-2 text-sm"
        >
          <option value="">—</option>
          {categoryOptions().map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-semibold text-midnight">Problem this solves</label>
        <textarea
          name="problemSolved"
          rows={2}
          defaultValue={existing?.problem_solved ?? ""}
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-midnight">Deliverables</label>
        <textarea
          name="deliverables"
          rows={2}
          defaultValue={existing?.deliverables ?? ""}
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-midnight">What&apos;s excluded (optional)</label>
        <textarea
          name="exclusions"
          rows={2}
          defaultValue={existing?.exclusions ?? ""}
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <label className="text-xs font-semibold text-midnight">Priced</label>
          <select
            name="paymentBasis"
            defaultValue={existing?.payment_basis ?? ""}
            className="mt-1 w-full rounded-lg border border-slate/25 px-2 py-2 text-sm"
          >
            <option value="">—</option>
            {paymentBasisOptions().map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-midnight">Price</label>
          <input
            name="price"
            type="number"
            min="0"
            step="0.01"
            defaultValue={existing?.price ?? ""}
            className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-midnight">Currency</label>
          <input
            name="currency"
            defaultValue={existing?.currency ?? "SSP"}
            className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-midnight">Turnaround (optional)</label>
        <input
          name="turnaround"
          defaultValue={existing?.turnaround ?? ""}
          placeholder="e.g. 3-5 business days"
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
      </div>

      {state.message && <p className="text-xs text-coral-ink">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-teal px-4 py-2 text-sm font-bold text-midnight disabled:opacity-60"
      >
        {pending ? "Saving…" : existing ? "Save changes" : "Save as draft"}
      </button>
    </form>
  );
}
