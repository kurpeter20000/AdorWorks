"use client";

import { useActionState } from "react";
import { consentToAssistance } from "@/lib/actions/assistance";
import type { FormState } from "@/lib/actions/auth";

const initialState: FormState = {};

export function AssistanceConsentWidget({ sessionId }: { sessionId: string }) {
  const boundAction = consentToAssistance.bind(null, sessionId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <div className="mt-8 rounded-xl border border-violet/30 bg-violet/5 p-5">
      <h2 className="font-bold text-midnight">Someone wants to help you finish your profile</h2>
      <p className="mt-1 text-sm text-slate">
        An AdorWorks onboarding agent has requested to help you complete your profile
        in person. They&rsquo;ll only be able to see and edit the specific fields
        listed here, and every change is recorded. Only agree if you&rsquo;re
        physically together with them right now.
      </p>
      <form action={formAction} className="mt-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-violet px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {pending ? "Confirming…" : "I consent to being helped"}
        </button>
      </form>
      {state.message && <p className="mt-2 text-sm text-coral">{state.message}</p>}
    </div>
  );
}
