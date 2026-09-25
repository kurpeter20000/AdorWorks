import type { Metadata } from "next";
import { requireSession } from "@/lib/dal/session";
import { ActivateAccountForm } from "./activate-account-form";

export const metadata: Metadata = { title: "Activate your account" };

// Only reachable once /auth/callback has exchanged the emailed invite
// link's session — requireSession() bounces anyone else to /login rather
// than showing a form that would just fail. See activateAccount's own
// comment (lib/actions/auth.ts) for why this is a separate page/action
// from /reset-password rather than reused.
export default async function ActivateAccountPage() {
  await requireSession();

  return (
    <div>
      <h1 className="text-2xl font-bold text-midnight">Activate your account</h1>
      <p className="mt-1 text-sm text-slate">
        Welcome to AdorWorks — your application was approved. Set a password to activate your account, then
        continue to finish your profile.
      </p>
      <ActivateAccountForm />
    </div>
  );
}
