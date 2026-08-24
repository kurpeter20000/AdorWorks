import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create your account" };

export default function SignupPage() {
  return (
    <div>
      <h1 className="text-xl font-bold text-midnight">Create your account</h1>
      <p className="mt-1 text-sm text-slate">
        Free to register, always. We&apos;ll never charge you to be considered for work.
      </p>
      <SignupForm />
      <p className="mt-4 text-center text-sm text-slate">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-teal-ink">
          Sign in
        </Link>
      </p>
    </div>
  );
}
