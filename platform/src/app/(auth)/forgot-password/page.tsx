import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";
import { getT } from "@/i18n/server";
import { rich } from "@/i18n/rich";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Reset your password") };
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; expired?: string }>;
}) {
  const { sent, expired } = await searchParams;
  const t = await getT();

  if (sent) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-bold text-midnight">{t("Check your email")}</h1>
        <p className="mt-3 text-sm text-slate">
          {t("If that email matches an AdorWorks account, we've sent a link to reset your password.")}
        </p>
        <p className="mt-3 text-sm text-slate">{t("The link works once, for one hour. If you ask more than once, use the newest email.")}</p>
        <p className="mt-3 text-sm text-slate">
          {rich(t("Didn't get it? Check spam, or <again>try again</again>."), {
            again: (text) => (
              <Link href="/forgot-password" className="font-semibold text-teal-ink">
                {text}
              </Link>
            ),
          })}
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-midnight">{t("Reset your password")}</h1>
      {expired && (
        <p className="mt-3 rounded-lg border border-warning/40 bg-amber-tint px-3 py-2 text-sm text-warning-ink" role="alert">
          {t("That reset link has expired or was already used. Enter your email to get a new one.")}
        </p>
      )}
      <p className="mt-1 text-sm text-slate">{t("Enter your account email and we'll send you a reset link.")}</p>
      <ForgotPasswordForm />
      <p className="mt-4 text-center text-sm text-slate">
        {t("Remembered it?")}{" "}
        <Link href="/login" className="font-semibold text-teal-ink">
          {t("Sign in")}
        </Link>
      </p>
    </div>
  );
}
