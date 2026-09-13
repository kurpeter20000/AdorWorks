"use client";

import { useActionState } from "react";
import { verifyMfaChallenge } from "@/lib/actions/mfa";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/actions/auth";

const initialState: FormState = {};

export function MfaChallengeForm({ factorId }: { factorId: string }) {
  const [state, formAction, pending] = useActionState(verifyMfaChallenge, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <input type="hidden" name="factorId" value={factorId} />

      <div>
        <label htmlFor="code" className="text-sm font-semibold text-midnight">
          6-digit code
        </label>
        <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus className="mt-1" />
        {state.errors?.code && <p className="mt-1 text-sm text-coral-ink">{state.errors.code[0]}</p>}
      </div>

      {state.message && <p className="text-sm text-coral-ink">{state.message}</p>}

      <Button type="submit" loading={pending} className="w-full">
        {pending ? "Verifying…" : "Verify"}
      </Button>
    </form>
  );
}
