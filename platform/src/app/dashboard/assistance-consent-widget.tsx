"use client";

import { useActionState } from "react";
import { consentToAssistance, revokeAssistanceSession } from "@/lib/actions/assistance";
import type { FormState } from "@/lib/actions/auth";

const initialState: FormState = {};

export function AssistanceConsentWidget({
  sessionId,
  freshAccount,
  status,
}: {
  sessionId: string;
  freshAccount: boolean;
  status: "pending_consent" | "active";
}) {
  const boundAction = consentToAssistance.bind(null, sessionId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const boundRevokeAction = revokeAssistanceSession.bind(null, sessionId);
  const [revokeState, revokeAction, revokePending] = useActionState(boundRevokeAction, initialState);

  if (status === "active") {
    return (
      <div className="mt-8 rounded-xl border border-teal/30 bg-teal/5 p-5">
        <h2 className="font-bold text-midnight">Assisted access is active</h2>
        <p className="mt-1 text-sm text-slate">
          Your assigned onboarding agent can edit only the fields you approved. Every change is recorded, and you can
          revoke access immediately.
        </p>
        <form action={revokeAction} className="mt-3">
          <button
            type="submit"
            disabled={revokePending}
            className="rounded-lg border border-coral/40 px-4 py-2 text-sm font-bold text-coral disabled:opacity-60"
          >
            {revokePending ? "Revoking…" : "Revoke assisted access"}
          </button>
        </form>
        {revokeState.message && <p className="mt-2 text-sm text-coral">{revokeState.message}</p>}
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-xl border border-violet/30 bg-violet/5 p-5">
      <h2 className="font-bold text-midnight">Someone wants to help you finish your profile</h2>
      <p className="mt-1 text-sm text-slate">
        An AdorWorks onboarding agent has requested to help you complete your profile
        in person. They&rsquo;ll only be able to see and edit the specific fields
        listed here, and every change is recorded. Only agree if you&rsquo;re
        physically together with them right now.
      </p>

      <form action={formAction} className="mt-3 space-y-2">
        {freshAccount && (
          <div className="space-y-2 rounded-lg border border-violet/20 bg-white p-3">
            <p className="text-xs text-slate">
              You&rsquo;re signed in with a temporary password — choose a real one now so you can sign
              in yourself next time.
            </p>
            <input
              type="password"
              name="newPassword"
              placeholder="New password (at least 8 characters)"
              required
              className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
            />
            <input
              type="password"
              name="confirmPassword"
              placeholder="Confirm new password"
              required
              className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
            />
          </div>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-violet px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {pending ? "Confirming…" : freshAccount ? "Set password and consent" : "I consent to being helped"}
        </button>
      </form>
      {state.message && <p className="mt-2 text-sm text-coral">{state.message}</p>}
    </div>
  );
}
