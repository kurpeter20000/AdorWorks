"use client";

import { useActionState } from "react";
import { confirmPublicationConsent } from "@/lib/actions/onboarding";
import type { FormState } from "@/lib/actions/auth";

const initialState: FormState = {};

export function ReviewForm() {
  const [state, formAction, pending] = useActionState(confirmPublicationConsent, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <label className="flex items-start gap-2 text-sm text-slate">
        <input type="checkbox" name="confirmed" required className="mt-1 accent-teal" />
        I confirm the information above is accurate, and I consent to
        AdorWorks reviewing it and, once verified, showing my profile to
        prospective employers.
      </label>

      {state.message && <p className="text-sm text-coral">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-bold text-midnight disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit for review"}
      </button>
    </form>
  );
}
