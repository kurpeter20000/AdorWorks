import type { Metadata } from "next";
import { requireSession } from "@/lib/dal/session";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Set a new password" };

// Only reachable once /auth/callback has exchanged the emailed reset
// link's code for a session — requireSession() bounces anyone else to
// /login rather than showing a form that would just fail.
export default async function ResetPasswordPage() {
  await requireSession();

  return (
    <div>
      <h1 className="text-xl font-bold text-midnight">Set a new password</h1>
      <p className="mt-1 text-sm text-slate">Choose a new password for your account.</p>
      <ResetPasswordForm />
    </div>
  );
}
