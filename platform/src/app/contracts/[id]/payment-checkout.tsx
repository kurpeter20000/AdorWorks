"use client";

import { useActionState, useState } from "react";
import { payMilestone } from "@/lib/actions/contracts";
import type { FormState } from "@/lib/actions/auth";
import { PAYMENT_PROVIDERS } from "@/lib/paymentProviders";
import { calculateFee } from "@/lib/domain/fees";

const initialState: FormState = {};

export function PaymentCheckout({
  milestoneId,
  amount,
  currency,
  realPaymentsEnabled,
}: {
  milestoneId: string;
  amount: number;
  currency: string;
  /** Server-computed (isFeatureEnabled reads an unprefixed env var, invisible to the client) — see contracts/[id]/page.tsx. */
  realPaymentsEnabled: boolean;
}) {
  const boundAction = payMilestone.bind(null, milestoneId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const [providerId, setProviderId] = useState(PAYMENT_PROVIDERS[0].id);
  const isCard = PAYMENT_PROVIDERS.find((p) => p.id === providerId)?.method === "card";
  const fee = calculateFee(amount);

  return (
    <form action={formAction} className="mt-3 rounded-lg border border-coral/30 bg-coral/5 p-3">
      {realPaymentsEnabled ? (
        <p className="text-xs font-bold uppercase tracking-wide text-coral">
          Live payment — MTN Mobile Money is connected; m-Gurush is not yet
        </p>
      ) : (
        <>
          <p className="text-xs font-bold uppercase tracking-wide text-coral">Simulation — no real money moves</p>
          <p className="mt-1 text-xs text-slate">
            AdorWorks doesn&apos;t process real payments yet. This walks through a checkout and records a simulated
            payment event, so the milestone can be marked paid and a receipt issued.
          </p>
        </>
      )}

      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate">Gross amount</dt>
          <dd className="font-semibold text-midnight">
            {currency} {fee.grossAmount.toLocaleString()}
          </dd>
        </div>
        <div className="flex justify-between text-xs">
          <dt className="text-slate">Platform fee ({fee.feePercent}%)</dt>
          <dd className="text-slate">
            {currency} {fee.feeAmount.toLocaleString()}
          </dd>
        </div>
        <div className="flex justify-between border-t border-coral/20 pt-1">
          <dt className="font-semibold text-midnight">Talent receives (net)</dt>
          <dd className="font-bold text-midnight">
            {currency} {fee.netAmount.toLocaleString()}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-sm font-semibold text-midnight">
        You will be charged {currency} {amount.toLocaleString()}
      </p>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {PAYMENT_PROVIDERS.map((p, i) => (
          <label
            key={p.id}
            className="flex items-center gap-2 rounded-lg border border-slate/25 bg-white px-2 py-2 text-xs has-[:checked]:border-coral"
          >
            <input
              type="radio"
              name="provider"
              value={p.id}
              defaultChecked={i === 0}
              required
              onChange={() => setProviderId(p.id)}
            />
            {p.label}
          </label>
        ))}
      </div>

      {isCard ? (
        <div className="mt-3 space-y-2">
          <div>
            <label htmlFor="cardNumber" className="block text-xs font-semibold text-midnight">
              Card number
            </label>
            <input
              id="cardNumber"
              name="cardNumber"
              inputMode="numeric"
              placeholder="4242 4242 4242 4242"
              className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-1.5 text-sm"
            />
            {state.errors?.cardNumber && <p className="mt-1 text-xs text-coral">{state.errors.cardNumber[0]}</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="cardExpiry" className="block text-xs font-semibold text-midnight">
                Expiry (MM/YY)
              </label>
              <input
                id="cardExpiry"
                name="cardExpiry"
                placeholder="12/28"
                className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-1.5 text-sm"
              />
              {state.errors?.cardExpiry && <p className="mt-1 text-xs text-coral">{state.errors.cardExpiry[0]}</p>}
            </div>
            <div>
              <label htmlFor="cardCvv" className="block text-xs font-semibold text-midnight">
                CVV
              </label>
              <input
                id="cardCvv"
                name="cardCvv"
                inputMode="numeric"
                placeholder="123"
                className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-1.5 text-sm"
              />
              {state.errors?.cardCvv && <p className="mt-1 text-xs text-coral">{state.errors.cardCvv[0]}</p>}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <label htmlFor="phone" className="block text-xs font-semibold text-midnight">
            Payer phone number
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            placeholder="e.g. +211 9XX XXX XXX"
            className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-1.5 text-sm"
          />
          {state.errors?.phone && <p className="mt-1 text-xs text-coral">{state.errors.phone[0]}</p>}
        </div>
      )}

      {state.errors?.provider && <p className="mt-1 text-xs text-coral">{state.errors.provider[0]}</p>}
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
