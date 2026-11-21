import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, Search } from "lucide-react";
import { resolveReturnPath } from "@/lib/domain/redirects";
import { LoginForm } from "./login-form";
import { msg } from "@/i18n/config";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Sign in") };
}

const INTENT_COPY = {
  talent: msg("Sign in to your Passport, applications and payments."),
  hire: msg("Sign in to your opportunities, shortlists and contracts."),
} as const;

// Cosmetic only — cues below the heading, not the auth flow itself. Once
// signed in, /dashboard already renders the right experience per the
// account's actual role (see getDashboardKind), so there's nothing to
// route here based on this value.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string; next?: string; reason?: string }>;
}) {
  const { as, next, reason } = await searchParams;
  const t = await getT();
  // "Find work" is the default tab, as in the design; ?as=hire switches it.
  const intent = as === "hire" ? "hire" : "talent";
  // The page someone was sent here from, carried through to sign-in/sign-up.
  const returnTo = resolveReturnPath(next);
  const withNext = (href: string) => (returnTo ? `${href}${href.includes("?") ? "&" : "?"}next=${encodeURIComponent(returnTo)}` : href);

  return (
    <div>
      <h1 className="text-[2.25rem] leading-tight font-extrabold text-midnight">
        {t("Welcome back")}
      </h1>
      <p className="mt-1.5 text-[#4a5263]">{t(INTENT_COPY[intent])}</p>
      {reason === "idle" && (
        <p className="mt-3 rounded-xl bg-[#f7f3ec] px-3 py-2 text-sm text-slate ring-1 ring-[#e6dfd2]" role="status">
          {t("You were signed out after 10 minutes of inactivity. Sign in again to continue.")}
        </p>
      )}
      {reason === "suspended" && (
        <p className="mt-3 rounded-xl bg-coral/10 px-3 py-2 text-sm text-midnight" role="status">
          {t("This account is suspended. If you think that's a mistake, you can")}{" "}
          <Link href="/appeal" prefetch={false} className="font-semibold text-teal-ink underline">
            {t("appeal the decision")}
          </Link>
          .
        </p>
      )}

      {/* S12-12: prefetch is off on every link here — automatic prefetch
          fired 4 server renders on load and competed with /login itself
          for CPU during CI's Lighthouse LCP window. None of these links
          needs instant navigation. */}
      <div className="mt-6 flex gap-1 rounded-[14px] bg-[#efe8dc] p-1 font-extrabold" role="tablist" aria-label={t("Signing in as")}>
        <Link
          href={withNext("/login?as=talent")}
          prefetch={false}
          role="tab"
          aria-selected={intent === "talent"}
          className={`flex min-h-[46px] flex-1 items-center justify-center gap-1.5 rounded-[11px] text-center transition-all ${
            intent === "talent" ? "bg-white text-midnight shadow-sm" : "text-slate hover:text-midnight"
          }`}
        >
          <Search className="size-4" aria-hidden="true" />
          {t("Find work")}
        </Link>
        <Link
          href={withNext("/login?as=hire")}
          prefetch={false}
          role="tab"
          aria-selected={intent === "hire"}
          className={`flex min-h-[46px] flex-1 items-center justify-center gap-1.5 rounded-[11px] text-center transition-all ${
            intent === "hire" ? "bg-white text-midnight shadow-sm" : "text-slate hover:text-midnight"
          }`}
        >
          <Briefcase className="size-4" aria-hidden="true" />
          {t("Hire talent")}
        </Link>
      </div>

      <LoginForm next={returnTo} />
      <Link
        href={withNext(`/phone?mode=signin&intent=${intent}`)}
        prefetch={false}
        className="mt-3 flex min-h-[50px] w-full items-center justify-center rounded-[14px] border border-[#d9d0bf] bg-white text-[15px] font-extrabold text-midnight hover:bg-[#f7f3ec]"
      >
        {t("Sign in with your phone number")}
      </Link>
      <p className="mt-5 text-center text-[#4a5263]">
        {t("New to AdorWorks?")}{" "}
        <Link href={withNext(`/signup?intent=${intent}`)} prefetch={false} className="font-extrabold text-teal-ink hover:underline">
          {t("Create a free account")}
        </Link>
      </p>
    </div>
  );
}
