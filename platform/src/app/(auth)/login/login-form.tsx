"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Lock, Mail } from "lucide-react";
import { login, type FormState } from "@/lib/actions/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const initialState: FormState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label htmlFor="email" className="text-sm font-semibold text-midnight">
          Email
        </label>
        <div className="relative mt-1">
          <Mail
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate/50"
            aria-hidden="true"
          />
          <Input id="email" name="email" type="email" autoComplete="email" required className="pl-10" />
        </div>
        {state.errors?.email && <p className="mt-1 text-sm text-coral-ink">{state.errors.email[0]}</p>}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-semibold text-midnight">
            Password
          </label>
          <Link href="/forgot-password" className="text-xs font-semibold text-teal-ink hover:underline">
            Forgot password?
          </Link>
        </div>
        <div className="relative mt-1">
          <Lock
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate/50"
            aria-hidden="true"
          />
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="pl-10"
          />
        </div>
      </div>

      {state.message && (
        <p className="text-sm text-coral-ink" role="alert">
          {state.message}
        </p>
      )}

      {/* loading={pending} already renders Button's built-in spinning
          Loader2 (components/ui/button.tsx) and disables the button for
          the duration of the pending Server Action — no separate spinner
          state needed here. */}
      <Button type="submit" loading={pending} size="lg" className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
