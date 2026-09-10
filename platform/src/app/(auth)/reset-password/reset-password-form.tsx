"use client";

import { useActionState } from "react";
import { resetPassword, type FormState } from "@/lib/actions/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const initialState: FormState = {};

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(resetPassword, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label htmlFor="password" className="text-sm font-semibold text-midnight">
          New password
        </label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required className="mt-1" />
        {state.errors?.password && <p className="mt-1 text-sm text-coral-ink">{state.errors.password[0]}</p>}
      </div>

      {state.message && <p className="text-sm text-coral-ink">{state.message}</p>}

      <Button type="submit" loading={pending} className="w-full">
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
