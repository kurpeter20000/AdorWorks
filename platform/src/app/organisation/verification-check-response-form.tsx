"use client";

import { useActionState } from "react";
import { submitVerificationInfo } from "@/lib/actions/organisation";
import type { FormState } from "@/lib/actions/auth";

const initialState: FormState = {};

export function VerificationCheckResponseForm({
  organisationId,
  checkId,
  isAppeal,
}: {
  organisationId: string;
  checkId: string;
  isAppeal: boolean;
}) {
  const action = submitVerificationInfo.bind(null, organisationId, checkId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <textarea
        name="note"
        rows={2}
        required
        placeholder={isAppeal ? "Why should this decision be reconsidered?" : "Provide the requested information"}
        className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
      />
      {state.errors?.note && <p className="text-xs text-coral-ink">{state.errors.note[0]}</p>}
      {state.message && <p className="text-xs text-coral-ink">{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-violet px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
      >
        {pending ? "Sending…" : isAppeal ? "Submit appeal" : "Submit information"}
      </button>
    </form>
  );
}
