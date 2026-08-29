"use client";

import { useActionState } from "react";
import { createOrganisation } from "@/lib/actions/organisation";
import type { FormState } from "@/lib/actions/auth";

const initialState: FormState = {};

export function SetupForm() {
  const [state, formAction, pending] = useActionState(createOrganisation, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label htmlFor="name" className="text-sm font-semibold text-midnight">
          Organisation or business name
        </label>
        <input
          id="name"
          name="name"
          required
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        {state.errors?.name && <p className="mt-1 text-sm text-coral-ink">{state.errors.name[0]}</p>}
      </div>

      <div>
        <label htmlFor="sector" className="text-sm font-semibold text-midnight">
          Sector <span className="font-normal text-slate">(optional)</span>
        </label>
        <input
          id="sector"
          name="sector"
          placeholder="e.g. NGO, media, technology, retail"
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="website" className="text-sm font-semibold text-midnight">
          Website <span className="font-normal text-slate">(optional)</span>
        </label>
        <input
          id="website"
          name="website"
          placeholder="https://"
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="billingEmail" className="text-sm font-semibold text-midnight">
          Billing email <span className="font-normal text-slate">(optional)</span>
        </label>
        <input
          id="billingEmail"
          name="billingEmail"
          type="email"
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        {state.errors?.billingEmail && (
          <p className="mt-1 text-sm text-coral-ink">{state.errors.billingEmail[0]}</p>
        )}
      </div>

      {state.message && <p className="text-sm text-coral-ink">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-violet px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Create organisation"}
      </button>
    </form>
  );
}
