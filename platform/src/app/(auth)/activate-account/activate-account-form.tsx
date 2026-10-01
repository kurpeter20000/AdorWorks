"use client";

import { useActionState } from "react";
import { activateAccount, type FormState } from "@/lib/actions/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

const initialState: FormState = {};

export function ActivateAccountForm() {
  const [state, formAction, pending] = useActionState(activateAccount, initialState);
  const t = useT();

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label htmlFor="password" className="text-sm font-semibold text-midnight">
          {t("Choose a password")}
        </label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required className="mt-1" />
        {state.errors?.password && <p className="mt-1 text-sm text-coral-ink">{t(state.errors.password[0])}</p>}
      </div>

      {state.message && <p className="text-sm text-coral-ink" role="alert">{t(state.message)}</p>}

      <Button type="submit" loading={pending} className="w-full">
        {pending ? t("Activating…") : t("Activate account")}
      </Button>
    </form>
  );
}
