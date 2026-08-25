import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;

  if (sent) {
    return (
      <div className="text-center">
        <h1 className="text-xl font-bold text-midnight">Check your email</h1>
        <p className="mt-3 text-sm text-slate">
          If that email matches an AdorWorks account, we&apos;ve sent a link to reset your password.
        </p>
        <p className="mt-3 text-sm text-slate">
          Didn&apos;t get it? Check spam, or{" "}
          <Link href="/forgot-password" className="font-semibold text-teal-ink">
            try again
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-midnight">Reset your password</h1>
      <p className="mt-1 text-sm text-slate">Enter your account email and we&apos;ll send you a reset link.</p>
      <ForgotPasswordForm />
      <p className="mt-4 text-center text-sm text-slate">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-teal-ink">
          Sign in
        </Link>
      </p>
    </div>
  );
}
