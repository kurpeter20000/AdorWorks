import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div>
      <h1 className="text-xl font-bold text-midnight">Sign in</h1>
      <LoginForm />
      <p className="mt-4 text-center text-sm text-slate">
        New to AdorWorks?{" "}
        <Link href="/signup" className="font-semibold text-teal">
          Create an account
        </Link>
      </p>
    </div>
  );
}
