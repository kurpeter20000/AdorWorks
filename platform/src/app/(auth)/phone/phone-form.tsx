"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Phone, KeyRound, User } from "lucide-react";
import { sendPhoneSignInCode, verifyPhoneSignInCode, type PhoneCodeState } from "@/lib/actions/phoneAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

const field = "h-[52px] rounded-[14px] border-[#d9d0bf] ps-10 text-base";
const icon = "pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-slate/50";

export function PhoneForm({ mode, intent, next, defaultPhone }: { mode: "signin" | "signup"; intent: "talent" | "hire"; next: string | null; defaultPhone?: string }) {
  const t = useT();
  const [sendState, sendAction, sending] = useActionState(sendPhoneSignInCode, {} as PhoneCodeState);
  const [verifyState, verifyAction, verifying] = useActionState(verifyPhoneSignInCode, {} as PhoneCodeState);
  const [restart, setRestart] = useState(0);
  const sentTo = (sendState.sentTo && restart === 0) || verifyState.sentTo ? (verifyState.sentTo ?? sendState.sentTo) : null;

  if (sentTo) {
    return (
      <form action={verifyAction} className="mt-5 space-y-4">
        <input type="hidden" name="phone" value={sentTo} />
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="intent" value={intent} />
        {next && <input type="hidden" name="next" value={next} />}
        <p className="rounded-xl bg-[#f7f3ec] px-3 py-2 text-sm text-midnight ring-1 ring-[#e6dfd2]" role="status">
          {t("We sent a 6-digit code by SMS to {phone}.", { phone: sentTo })}
        </p>
        <div>
          <label htmlFor="token" className="text-sm font-semibold text-midnight">
            {t("Code")}
          </label>
          <div className="relative mt-1">
            <KeyRound className={icon} aria-hidden="true" />
            <Input id="token" name="token" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus className={`${field} tracking-[0.3em]`} />
          </div>
          {verifyState.errors?.token && <p className="mt-1 text-sm text-coral-ink">{t(verifyState.errors.token[0])}</p>}
        </div>
        <Button type="submit" loading={verifying} size="lg" className="h-[54px] w-full rounded-[14px] text-[17px] font-extrabold">
          {verifying ? t("Checking…") : mode === "signup" ? t("Create my account") : t("Sign in")}
        </Button>
        <button type="button" onClick={() => setRestart((n) => n + 1)} className="w-full text-sm font-bold text-teal-ink underline">
          {t("Use a different number or send a new code")}
        </button>
      </form>
    );
  }

  return (
    <form action={(fd) => { setRestart(0); return sendAction(fd); }} className="mt-5 space-y-4">
      <input type="hidden" name="mode" value={mode} />
      {next && <input type="hidden" name="next" value={next} />}
      {mode === "signup" && (
        <>
          <input type="hidden" name="intent" value={intent} />
          <div>
            <label htmlFor="fullName" className="text-sm font-semibold text-midnight">
              {t("Full name")}
            </label>
            <div className="relative mt-1">
              <User className={icon} aria-hidden="true" />
              <Input id="fullName" name="fullName" autoComplete="name" required className={field} />
            </div>
            {sendState.errors?.fullName && <p className="mt-1 text-sm text-coral-ink">{t(sendState.errors.fullName[0])}</p>}
          </div>
        </>
      )}
      <div>
        <label htmlFor="phone" className="text-sm font-semibold text-midnight">
          {t("Phone number")}
        </label>
        <div className="relative mt-1">
          <Phone className={icon} aria-hidden="true" />
          <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0912 345 678" defaultValue={defaultPhone} required className={field} />
        </div>
        {sendState.errors?.phone && <p className="mt-1 text-sm text-coral-ink">{t(sendState.errors.phone[0])}</p>}
      </div>
      {mode === "signup" && (
        <label className="flex items-start gap-2 text-sm text-midnight">
          <input type="checkbox" name="policyConsent" required className="mt-1 size-4 accent-teal" />
          <span>
            {t("I agree to the")}{" "}
            <a href="https://adorworks.pages.dev/terms.html" target="_blank" rel="noreferrer" className="font-semibold text-teal-ink underline">
              {t("Terms of Use")}
            </a>{" "}
            {t("and")}{" "}
            <a href="https://adorworks.pages.dev/privacy.html" target="_blank" rel="noreferrer" className="font-semibold text-teal-ink underline">
              {t("Privacy Policy")}
            </a>
          </span>
        </label>
      )}
      {sendState.errors?.policyConsent && <p className="text-sm text-coral-ink">{t(sendState.errors.policyConsent[0])}</p>}
      {sendState.message && (
        <p className="text-sm text-coral-ink" role="alert">
          {t(sendState.message)}
        </p>
      )}
      {sendState.noAccountFor && (
        <Link
          href={`/phone?mode=signup&intent=${intent}&phone=${encodeURIComponent(sendState.noAccountFor)}${next ? `&next=${encodeURIComponent(next)}` : ""}`}
          prefetch={false}
          className="flex min-h-[50px] w-full items-center justify-center rounded-[14px] border border-teal/40 bg-teal/5 text-[15px] font-extrabold text-teal-ink"
        >
          {t("Create an account with this number")}
        </Link>
      )}
      <Button type="submit" loading={sending} size="lg" className="h-[54px] w-full rounded-[14px] text-[17px] font-extrabold">
        {sending ? t("Sending…") : t("Send me a code")}
      </Button>
      <p className="text-center text-xs text-slate">{t("Standard SMS rates from your network may apply.")}</p>
      <p className="text-center text-sm">
        <Link href={mode === "signup" ? `/signup?intent=${intent}` : `/login?as=${intent}`} prefetch={false} className="font-bold text-teal-ink underline">
          {mode === "signup" ? t("Sign up with email instead") : t("Sign in with email instead")}
        </Link>
      </p>
    </form>
  );
}
