import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, LogIn, Search } from "lucide-react";
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
      {/* S12-12 gap-check finding (2026-09-24): every Link below defaults to
          Next.js's automatic prefetch, which fires a real server-side RSC
          render for its target as soon as the link is in viewport — on
          this page that's 4 links, all in viewport on load. Confirmed via
          a captured CI-adjacent network trace that all 4 fire immediately.
          Harmless on a normal server, but on CI's Lighthouse job the
          Next.js server and the Lighthouse-launched Chrome share the same
          constrained runner, so this competes for CPU with the actual
          /login request during the exact window LCP is measured in —
          disabled here since none of these need instant navigation. */}
      <div className="mb-6 flex gap-1 rounded-lg bg-cloud p-1 text-sm font-semibold" role="tablist" aria-label="Signing in as">
        <Link
          href="/login?as=talent"
          prefetch={false}
          role="tab"
          aria-selected={intent === "talent"}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-center transition-all ${
            intent === "talent" ? "bg-white text-midnight shadow-sm" : "text-slate hover:text-midnight"
          }`}
        >
          <Search className="size-3.5" aria-hidden="true" />
          Find work
        </Link>
        <Link
          href="/login?as=hire"
          prefetch={false}
          role="tab"
          aria-selected={intent === "hire"}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-center transition-all ${
            intent === "hire" ? "bg-white text-midnight shadow-sm" : "text-slate hover:text-midnight"
          }`}
        >
          <Briefcase className="size-3.5" aria-hidden="true" />
          Hire talent
        </Link>
      </div>

      <span className="inline-flex size-10 items-center justify-center rounded-full bg-teal/15 text-teal-ink">
        <LogIn className="size-5" aria-hidden="true" />
      </span>
      <h1 className="mt-3 text-2xl font-bold text-midnight">Sign in</h1>
      {intent && <p className="mt-1 text-sm text-slate">{INTENT_COPY[intent]}</p>}
      <LoginForm />
      <p className="mt-4 text-center text-sm text-slate">
        New to AdorWorks?{" "}
        <Link
          href={intent ? `/signup?intent=${intent}` : "/signup"}
          prefetch={false}
          className="font-semibold text-teal-ink hover:underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
