"use client";

import { useActionState } from "react";
import { payMilestone } from "@/lib/actions/contracts";
import type { FormState } from "@/lib/actions/auth";
import { PAYMENT_PROVIDERS } from "@/lib/paymentProviders";

const initialState: FormState = {};

export function PaymentCheckout({
  milestoneId,
  amount,
  currency,
}: {
  milestoneId: string;
  amount: number;
  currency: string;
}) {
  const boundAction = payMilestone.bind(null, milestoneId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className="mt-3 rounded-lg border border-coral/30 bg-coral/5 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-coral">Simulation — no real money moves</p>
      <p className="mt-1 text-xs text-slate">
        AdorWorks doesn&apos;t process real payments yet. This walks through a mobile-money checkout and records a
        simulated payment event, so the milestone can be marked paid and a receipt issued.
      </p>

      <p className="mt-3 text-sm font-semibold text-midnight">
        Pay {currency} {amount.toLocaleString()}
      </p>

      <div className="mt-2 grid grid-cols-2 gap-2">
        {PAYMENT_PROVIDERS.map((p, i) => (
          <label
            key={p.id}
            className="flex items-center gap-2 rounded-lg border border-slate/25 bg-white px-3 py-2 text-sm has-[:checked]:border-coral"
          >
            <input type="radio" name="provider" value={p.id} defaultChecked={i === 0} required />
            {p.label}
          </label>
        ))}
      </div>

      <label htmlFor="phone" className="mt-3 block text-xs font-semibold text-midnight">
        Payer phone number
      </label>
      <input
        id="phone"
        name="phone"
        type="tel"
        required
        placeholder="e.g. +211 9XX XXX XXX"
        className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-1.5 text-sm"
      />
      {state.errors?.provider && <p className="mt-1 text-xs text-coral">{state.errors.provider[0]}</p>}
      {state.errors?.phone && <p className="mt-1 text-xs text-coral">{state.errors.phone[0]}</p>}
      {state.message && <p className="mt-1 text-xs text-coral">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-3 w-full rounded-lg bg-coral px-3 py-1.5 text-sm font-bold text-white disabled:opacity-60"
      >
        {pending ? "Processing payment…" : "Pay now"}
      </button>
    </form>
  );
}
