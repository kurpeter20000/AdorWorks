import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const INTENT_COPY = {
  talent: "Ready to find your next opportunity.",
  hire: "Ready to review your hiring pipeline.",
} as const;

// Cosmetic only — cues below the heading, not the auth flow itself. Once
// signed in, /dashboard already renders the right experience per the
// account's actual role (see getDashboardKind), so there's nothing to
// route here based on this value.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const { as } = await searchParams;
  const intent = as === "hire" ? "hire" : as === "talent" ? "talent" : null;

  return (
    <div>
      <div className="mb-5 flex gap-1 rounded-lg bg-cloud p-1 text-sm font-semibold" role="tablist" aria-label="Signing in as">
        <Link
          href="/login?as=talent"
          role="tab"
          aria-selected={intent === "talent"}
          className={`flex-1 rounded-md py-1.5 text-center transition-colors ${
            intent === "talent" ? "bg-white text-midnight shadow-sm" : "text-slate hover:text-midnight"
          }`}
        >
          Find work
        </Link>
        <Link
          href="/login?as=hire"
          role="tab"
          aria-selected={intent === "hire"}
          className={`flex-1 rounded-md py-1.5 text-center transition-colors ${
            intent === "hire" ? "bg-white text-midnight shadow-sm" : "text-slate hover:text-midnight"
          }`}
        >
          Hire talent
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-midnight">Sign in</h1>
      {intent && <p className="mt-1 text-sm text-slate">{INTENT_COPY[intent]}</p>}
      <LoginForm />
      <p className="mt-4 text-center text-sm text-slate">
        New to AdorWorks?{" "}
        <Link href={intent ? `/signup?intent=${intent}` : "/signup"} className="font-semibold text-teal-ink">
          Create an account
        </Link>
      </p>
    </div>
  );
}
