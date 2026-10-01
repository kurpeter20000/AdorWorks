"use client";

import { useActionState } from "react";
import { signup, type FormState } from "@/lib/actions/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MARKETING_SITE_URL } from "@/lib/domain/marketingSite";
import { useT } from "@/i18n/client";
import { rich } from "@/i18n/rich";

const initialState: FormState = {};

export function SignupForm({ defaultIntent = "talent", next }: { defaultIntent?: "talent" | "hire"; next?: string | null }) {
  const [state, formAction, pending] = useActionState(signup, initialState);
  const t = useT();
  const err = (e?: string[]) => (e?.[0] ? t(e[0]) : null);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-midnight">{t("I'm here to")}</legend>
        <label className="flex items-center gap-2 rounded-lg border border-slate/20 p-3 text-sm has-[:checked]:border-teal has-[:checked]:bg-teal/5">
          <input type="radio" name="intent" value="talent" defaultChecked={defaultIntent === "talent"} className="accent-teal" />
          {t("Find work — freelance, contract, full-time or offer a service")}
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-slate/20 p-3 text-sm has-[:checked]:border-teal has-[:checked]:bg-teal/5">
          <input type="radio" name="intent" value="hire" defaultChecked={defaultIntent === "hire"} className="accent-teal" />
          {t("Hire talent — for myself or an organisation")}
        </label>
        {state.errors?.intent && <p className="text-sm text-coral-ink">{err(state.errors.intent)}</p>}
      </fieldset>

      <div>
        <label htmlFor="fullName" className="text-sm font-semibold text-midnight">
          {t("Full name")}
        </label>
        <Input id="fullName" name="fullName" autoComplete="name" required className="mt-1" />
        {state.errors?.fullName && <p className="mt-1 text-sm text-coral-ink">{err(state.errors.fullName)}</p>}
      </div>

      <div>
        <label htmlFor="email" className="text-sm font-semibold text-midnight">
          {t("Email")}
        </label>
        <Input id="email" name="email" type="email" autoComplete="email" required className="mt-1" />
        {state.errors?.email && <p className="mt-1 text-sm text-coral-ink">{err(state.errors.email)}</p>}
      </div>

      <div>
        <label htmlFor="password" className="text-sm font-semibold text-midnight">
          {t("Password")}
        </label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required className="mt-1" />
        {state.errors?.password && (
          <ul className="mt-1 list-disc ps-5 text-sm text-coral-ink">
            {state.errors.password.map((e) => (
              <li key={e}>{t(e)}</li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <label className="flex items-start gap-2 text-sm text-slate">
          <input type="checkbox" name="policyConsent" value="on" className="mt-0.5 accent-teal" />
          <span>
            {rich(t("I agree to AdorWorks's <terms>Terms of Use</terms> and <privacy>Privacy Policy</privacy>."), {
              terms: (text) => (
                <a href={`${MARKETING_SITE_URL}/terms.html`} target="_blank" rel="noopener noreferrer" className="font-semibold text-teal-ink underline">
                  {text}
                </a>
              ),
              privacy: (text) => (
                <a href={`${MARKETING_SITE_URL}/privacy.html`} target="_blank" rel="noopener noreferrer" className="font-semibold text-teal-ink underline">
                  {text}
                </a>
              ),
            })}
          </span>
        </label>
        {state.errors?.policyConsent && <p className="mt-1 text-sm text-coral-ink">{err(state.errors.policyConsent)}</p>}
      </div>

      {state.message && <p className="text-sm text-coral-ink" role="alert">{t(state.message)}</p>}

      <Button type="submit" loading={pending} className="w-full">
        {pending ? t("Creating account…") : t("Create account")}
      </Button>
    </form>
  );
}
