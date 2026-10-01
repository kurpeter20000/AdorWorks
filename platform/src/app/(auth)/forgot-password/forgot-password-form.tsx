"use client";

import { useActionState } from "react";
import { requestPasswordReset, type FormState } from "@/lib/actions/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

const initialState: FormState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);
  const t = useT();

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label htmlFor="email" className="text-sm font-semibold text-midnight">
          {t("Email")}
        </label>
        <Input id="email" name="email" type="email" autoComplete="email" required className="mt-1" />
        {state.errors?.email && <p className="mt-1 text-sm text-coral-ink">{t(state.errors.email[0])}</p>}
      </div>

      {state.message && <p className="text-sm text-coral-ink" role="alert">{t(state.message)}</p>}

      <Button type="submit" loading={pending} className="w-full">
        {pending ? t("Sending…") : t("Send reset link")}
      </Button>
    </form>
  );
}
