"use client";

import { useActionState } from "react";
import { resetPassword, type FormState } from "@/lib/actions/auth";

const initialState: FormState = {};

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(resetPassword, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label htmlFor="password" className="text-sm font-semibold text-midnight">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        {state.errors?.password && <p className="mt-1 text-sm text-coral">{state.errors.password[0]}</p>}
      </div>

      {state.message && <p className="text-sm text-coral">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-bold text-midnight disabled:opacity-60"
      >
        {pending ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
