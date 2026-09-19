"use client";

import { useActionState } from "react";
import { verifyMfaEnrollment } from "@/lib/actions/mfa";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/actions/auth";

const initialState: FormState = {};

export function MfaSetupForm({ factorId, qrCode, secret }: { factorId: string; qrCode: string; secret: string }) {
  const [state, formAction, pending] = useActionState(verifyMfaEnrollment, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <input type="hidden" name="factorId" value={factorId} />

      <ol className="list-decimal space-y-3 pl-5 text-sm text-slate">
        <li>
          Scan this code with an authenticator app (Google Authenticator, Authy, 1Password, etc.):
          {/* Supabase returns this as a ready-to-use SVG data URI — next/image
              doesn't optimize SVGs meaningfully and this is generated
              fresh per enrollment, not a static/remote asset worth its
              overhead. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrCode} alt="Scan this QR code with your authenticator app" className="mt-2 size-40" />
        </li>
        <li>
          Can&apos;t scan it? Enter this code manually instead: <code className="font-mono text-midnight">{secret}</code>
        </li>
        <li>Enter the 6-digit code your app shows below.</li>
      </ol>

      <div>
        <label htmlFor="code" className="text-sm font-semibold text-midnight">
          6-digit code
        </label>
        <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required className="mt-1" />
        {state.errors?.code && <p className="mt-1 text-sm text-coral-ink">{state.errors.code[0]}</p>}
      </div>

      {state.message && <p className="text-sm text-coral-ink" role="alert">{state.message}</p>}

      <Button type="submit" loading={pending} className="w-full">
        {pending ? "Verifying…" : "Verify and continue"}
      </Button>
    </form>
  );
}
