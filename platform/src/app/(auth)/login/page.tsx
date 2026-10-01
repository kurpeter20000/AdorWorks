import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, LogIn, Search } from "lucide-react";
import { resolveReturnPath } from "@/lib/domain/redirects";
import { LoginForm } from "./login-form";
import { msg } from "@/i18n/config";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Sign in") };
}

const INTENT_COPY = {
  talent: msg("Ready to find your next opportunity."),
  hire: msg("Ready to review your hiring pipeline."),
} as const;

// Cosmetic only — cues below the heading, not the auth flow itself. Once
// signed in, /dashboard already renders the right experience per the
// account's actual role (see getDashboardKind), so there's nothing to
// route here based on this value.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string; next?: string }>;
}) {
  const { as, next } = await searchParams;
  const t = await getT();
  const intent = as === "hire" ? "hire" : as === "talent" ? "talent" : null;
  // The page someone was sent here from, carried through to sign-in/sign-up.
  const returnTo = resolveReturnPath(next);
  const withNext = (href: string) => (returnTo ? `${href}${href.includes("?") ? "&" : "?"}next=${encodeURIComponent(returnTo)}` : href);

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
      <div className="mb-6 flex gap-1 rounded-lg bg-cloud p-1 text-sm font-semibold" role="tablist" aria-label={t("Signing in as")}>
        <Link
          href={withNext("/login?as=talent")}
          prefetch={false}
          role="tab"
          aria-selected={intent === "talent"}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-center transition-all ${
            intent === "talent" ? "bg-white text-midnight shadow-sm" : "text-slate hover:text-midnight"
          }`}
        >
          <Search className="size-3.5" aria-hidden="true" />
          {t("Find work")}
        </Link>
        <Link
          href={withNext("/login?as=hire")}
          prefetch={false}
          role="tab"
          aria-selected={intent === "hire"}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-center transition-all ${
            intent === "hire" ? "bg-white text-midnight shadow-sm" : "text-slate hover:text-midnight"
          }`}
        >
          <Briefcase className="size-3.5" aria-hidden="true" />
          {t("Hire talent")}
        </Link>
      </div>

      <span className="inline-flex size-10 items-center justify-center rounded-full bg-teal/15 text-teal-ink">
        <LogIn className="size-5" aria-hidden="true" />
      </span>
      <h1 className="mt-3 text-2xl font-bold text-midnight">{t("Sign in")}</h1>
      {intent && <p className="mt-1 text-sm text-slate">{t(INTENT_COPY[intent])}</p>}
      <LoginForm next={returnTo} />
      <p className="mt-4 text-center text-sm text-slate">
        {t("New to AdorWorks?")}{" "}
        <Link
          href={withNext(intent ? `/signup?intent=${intent}` : "/signup")}
          prefetch={false}
          className="font-semibold text-teal-ink hover:underline"
        >
          {t("Create an account")}
        </Link>
      </p>
    </div>
  );
}
