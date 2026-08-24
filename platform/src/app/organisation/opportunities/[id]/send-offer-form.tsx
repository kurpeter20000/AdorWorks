"use client";

import { useActionState, useState } from "react";
import { sendOffer } from "@/lib/actions/offers";
import type { FormState } from "@/lib/actions/auth";

const initialState: FormState = {};

export function SendOfferForm({ applicationId }: { applicationId: string }) {
  const [open, setOpen] = useState(false);
  const boundAction = sendOffer.bind(null, applicationId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 rounded-lg bg-violet px-3 py-1.5 text-sm font-bold text-white"
      >
        Send offer
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-3 space-y-3 rounded-lg bg-cloud p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="text-xs font-semibold text-midnight">Paid</label>
          <select
            name="paymentBasis"
            required
            className="mt-1 w-full rounded-lg border border-slate/25 px-2 py-1.5 text-sm"
          >
            <option value="fixed">Fixed price</option>
            <option value="milestone">Per milestone</option>
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-midnight">Currency</label>
          <input
            name="currency"
            defaultValue="SSP"
            className="mt-1 w-full rounded-lg border border-slate/25 px-2 py-1.5 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-midnight">Amount</label>
        <input
          name="compensationAmount"
          type="number"
          min="0"
          step="0.01"
          required
          className="mt-1 w-full rounded-lg border border-slate/25 px-2 py-1.5 text-sm"
        />
        {state.errors?.compensationAmount && (
          <p className="mt-1 text-xs text-coral">{state.errors.compensationAmount[0]}</p>
        )}
      </div>
      <div>
        <label className="text-xs font-semibold text-midnight">Message (optional)</label>
        <textarea
          name="message"
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate/25 px-2 py-1.5 text-sm"
        />
      </div>
      {state.message && <p className="text-xs text-coral">{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-violet px-3 py-1.5 text-sm font-bold text-white disabled:opacity-60"
      >
        {pending ? "Sending…" : "Confirm and send offer"}
      </button>
    </form>
  );
}
