"use client";

import { useActionState } from "react";
import { signup, type FormState } from "@/lib/actions/auth";

const initialState: FormState = {};

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-midnight">I&apos;m here to</legend>
        <label className="flex items-center gap-2 rounded-lg border border-slate/20 p-3 text-sm has-[:checked]:border-teal has-[:checked]:bg-teal/5">
          <input type="radio" name="intent" value="talent" defaultChecked className="accent-teal" />
          Find work — freelance, contract, full-time or offer a service
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-slate/20 p-3 text-sm has-[:checked]:border-teal has-[:checked]:bg-teal/5">
          <input type="radio" name="intent" value="hire" className="accent-teal" />
          Hire talent — for myself or an organisation
        </label>
        {state.errors?.intent && <p className="text-sm text-coral-ink">{state.errors.intent[0]}</p>}
      </fieldset>

      <div>
        <label htmlFor="fullName" className="text-sm font-semibold text-midnight">
          Full name
        </label>
        <input
          id="fullName"
          name="fullName"
          autoComplete="name"
          required
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        {state.errors?.fullName && <p className="mt-1 text-sm text-coral-ink">{state.errors.fullName[0]}</p>}
      </div>

      <div>
        <label htmlFor="email" className="text-sm font-semibold text-midnight">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        {state.errors?.email && <p className="mt-1 text-sm text-coral-ink">{state.errors.email[0]}</p>}
      </div>

      <div>
        <label htmlFor="password" className="text-sm font-semibold text-midnight">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        {state.errors?.password && (
          <ul className="mt-1 list-disc pl-5 text-sm text-coral-ink">
            {state.errors.password.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        )}
      </div>

      {state.message && <p className="text-sm text-coral-ink">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-bold text-midnight disabled:opacity-60"
      >
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
