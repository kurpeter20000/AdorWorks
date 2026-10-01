import type { Metadata } from "next";
import { requireSession } from "@/lib/dal/session";
import { ResetPasswordForm } from "./reset-password-form";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Set a new password") };
}

// Only reachable once /auth/callback has exchanged the emailed reset
// link's code for a session — requireSession() bounces anyone else to
// /login rather than showing a form that would just fail.
export default async function ResetPasswordPage() {
  await requireSession();
  const t = await getT();

  return (
    <div>
      <h1 className="text-2xl font-bold text-midnight">{t("Set a new password")}</h1>
      <p className="mt-1 text-sm text-slate">{t("Choose a new password for your account.")}</p>
      <ResetPasswordForm />
    </div>
  );
}
