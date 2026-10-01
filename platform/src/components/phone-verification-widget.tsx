"use client";

import { useActionState, useEffect, useState } from "react";
import { sendPhoneOtp, verifyPhoneOtp, type SendOtpState } from "@/lib/actions/phone";
import type { FormState } from "@/lib/actions/auth";
import { useT } from "@/i18n/client";

const sendInitialState: SendOtpState = {};
const verifyInitialState: FormState = {};
const RESEND_COOLDOWN_SECONDS = 60;

export function PhoneVerificationWidget() {
  const [phone, setPhone] = useState("");
  const t = useT();
  const [wentBack, setWentBack] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [sendState, sendAction, sending] = useActionState(sendPhoneOtp, sendInitialState);
  const [verifyState, verifyAction, verifying] = useActionState(verifyPhoneOtp, verifyInitialState);

  // Derived from the action's own result, not mirrored via an effect —
  // "code" only once a send has actually succeeded, "phone" again if the
  // last attempt failed (sendState.sent absent) or the user asked to
  // change the number.
  const stage = !wentBack && sendState.sent ? "code" : "phone";
  const cooldown =
    lastSentAt !== null ? Math.max(0, RESEND_COOLDOWN_SECONDS - Math.floor((now - lastSentAt) / 1000)) : 0;

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  return (
    <div className="mt-8 rounded-xl border border-coral/30 bg-coral/5 p-5">
      <h2 className="font-bold text-midnight">{t("Verify your phone number")}</h2>

      {stage === "phone" ? (
        <form
          key="phone-form"
          action={sendAction}
          onSubmit={() => {
            setWentBack(false);
            setLastSentAt(Date.now());
          }}
          className="mt-3 space-y-2"
        >
          <p className="text-sm text-slate">{t("We'll text you a 6-digit code.")}</p>
          <input
            name="phone"
            placeholder="+211900000000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm sm:w-64"
          />
          {sendState.errors?.phone && <p className="text-sm text-coral-ink" role="alert">{t(sendState.errors.phone[0])}</p>}
          {sendState.message && <p className="text-sm text-coral-ink" role="alert">{t(sendState.message)}</p>}
          <button
            type="submit"
            disabled={sending}
            className="rounded-lg bg-coral-ink px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {sending ? t("Sending…") : t("Send code")}
          </button>
        </form>
      ) : (
        <form key="code-form" action={verifyAction} className="mt-3 space-y-2">
          <p className="text-sm text-slate">{t("Enter the 6-digit code we sent you.")}</p>
          <input
            name="code"
            inputMode="numeric"
            maxLength={6}
            required
            className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm sm:w-40"
          />
          {verifyState.errors?.code && <p className="text-sm text-coral-ink" role="alert">{t(verifyState.errors.code[0])}</p>}
          {verifyState.message && <p className="text-sm text-coral-ink" role="alert">{t(verifyState.message)}</p>}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={verifying}
              className="rounded-lg bg-coral-ink px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {verifying ? t("Verifying…") : t("Verify")}
            </button>
            <button
              type="button"
              disabled={cooldown > 0 || sending}
              onClick={() => {
                setLastSentAt(Date.now());
                const formData = new FormData();
                formData.set("phone", phone);
                sendAction(formData);
              }}
              className="text-xs font-semibold text-coral-ink underline disabled:opacity-60"
            >
              {cooldown > 0 ? t("Resend in {n}s", { n: cooldown }) : t("Resend code")}
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={() => setWentBack(true)}
              className="text-xs font-semibold text-slate underline"
            >
              {t("Change number")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
