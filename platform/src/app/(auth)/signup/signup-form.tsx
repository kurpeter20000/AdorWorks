"use client";

import { useActionState } from "react";
import { signup, type FormState } from "@/lib/actions/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const initialState: FormState = {};

export function SignupForm({ defaultIntent = "talent" }: { defaultIntent?: "talent" | "hire" }) {
  const [state, formAction, pending] = useActionState(signup, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-midnight">I&apos;m here to</legend>
        <label className="flex items-center gap-2 rounded-lg border border-slate/20 p-3 text-sm has-[:checked]:border-teal has-[:checked]:bg-teal/5">
          <input type="radio" name="intent" value="talent" defaultChecked={defaultIntent === "talent"} className="accent-teal" />
          Find work — freelance, contract, full-time or offer a service
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-slate/20 p-3 text-sm has-[:checked]:border-teal has-[:checked]:bg-teal/5">
          <input type="radio" name="intent" value="hire" defaultChecked={defaultIntent === "hire"} className="accent-teal" />
          Hire talent — for myself or an organisation
        </label>
        {state.errors?.intent && <p className="text-sm text-coral-ink">{state.errors.intent[0]}</p>}
      </fieldset>

      <div>
        <label htmlFor="fullName" className="text-sm font-semibold text-midnight">
          Full name
        </label>
        <Input id="fullName" name="fullName" autoComplete="name" required className="mt-1" />
        {state.errors?.fullName && <p className="mt-1 text-sm text-coral-ink">{state.errors.fullName[0]}</p>}
      </div>

      <div>
        <label htmlFor="email" className="text-sm font-semibold text-midnight">
          Email
        </label>
        <Input id="email" name="email" type="email" autoComplete="email" required className="mt-1" />
        {state.errors?.email && <p className="mt-1 text-sm text-coral-ink">{state.errors.email[0]}</p>}
      </div>

      <div>
        <label htmlFor="password" className="text-sm font-semibold text-midnight">
          Password
        </label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required className="mt-1" />
        {state.errors?.password && (
          <ul className="mt-1 list-disc pl-5 text-sm text-coral-ink">
            {state.errors.password.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        )}
      </div>

      {state.message && <p className="text-sm text-coral-ink">{state.message}</p>}

      <Button type="submit" loading={pending} className="w-full">
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
