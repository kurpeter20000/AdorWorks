import { ArrowLeft, ShieldCheck } from "lucide-react";
import { CONTACT_URL, MARKETING_SITE_URL } from "@/lib/domain/marketingSite";
import { HeroVideoBackgroundFrom } from "@/components/hero-video-background";
import { LanguageSwitcher } from "@/components/language-switcher";
import { msg } from "@/i18n/config";
import { getT } from "@/i18n/server";

// Same three value props on both sides of the marketplace — the auth
// pages are the one place login/signup for talent and employers share a
// single shell, so the copy here stays intentionally role-neutral.
const VALUE_PROPS = [
  {
    title: msg("Fair-ranked matching"),
    body: msg("Opportunities and candidates surfaced by skill overlap — never by who pays more."),
  },
  {
    title: msg("Pay as work is approved"),
    body: msg("Milestone by milestone, with written terms and a receipt every time."),
  },
  {
    title: msg("Verified from day one"),
    body: msg("Every profile carries a visible trust tier, so credibility is never just a claim."),
  },
];
const NUMERALS = ["i.", "ii.", "iii."];

/**
 * Sign-in shell (redesign 2026, Login design): a dark brand panel with the
 * promise on the left (wide screens only), and a light panel on the right
 * holding the form, the language switch, a way back to the public site and
 * a help card. On phones only the light panel shows, so the background
 * video never loads there.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  return (
    <div
      className={`flex flex-1 flex-col bg-white text-midnight lg:flex-row`}
      // Headings use the app's own sans (Manrope), bold; Arabic falls
      // through to the app's Arabic face.
      style={{ "--font-auth-display": "var(--font-manrope), var(--font-arabic), system-ui, sans-serif" } as React.CSSProperties}
    >
      {/* The poster is the brand panel's background; the panel only shows
          from the lg breakpoint up, so the poster is only fetched there. */}
      <link rel="preload" as="image" href="/hero/hero-poster.jpg" media="(min-width: 1024px)" />

      <aside className="relative isolate hidden min-h-dvh flex-col overflow-hidden bg-midnight text-[#f7f3ec] lg:flex lg:w-[46%]">
        <HeroVideoBackgroundFrom query="(min-width: 1024px)" className="absolute inset-0 -z-20 h-full w-full object-cover" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[#10171f]/70" />
        <div className="flex flex-1 flex-col gap-6 px-12 py-9 xl:px-16">
          <a href={MARKETING_SITE_URL} className="self-start text-lg font-extrabold text-[#f7f3ec]">
            AdorWorks
          </a>
          <div className="mt-auto flex max-w-md flex-col gap-6">
            <p className="font-[family-name:var(--font-auth-display)] text-5xl leading-[1.06] font-extrabold tracking-tight xl:text-[3.4rem]">
              {t("Talent found.")}
              <br />
              <em className="text-[#7fd8c8] not-italic">{t("Work delivered.")}</em>
            </p>
            <ul className="flex flex-col gap-4">
              {VALUE_PROPS.map((item, i) => (
                <li key={item.title} className="flex gap-3">
                  <span dir="ltr" className="w-6 flex-none font-[family-name:var(--font-auth-display)] text-[#7fd8c8]" aria-hidden="true">
                    {NUMERALS[i]}
                  </span>
                  <span>
                    <strong className="block font-bold">{t(item.title)}</strong>
                    <span className="text-white/80">{t(item.body)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>

      <main className="flex min-h-dvh flex-1 flex-col px-5 py-5 sm:px-8 lg:py-7 [&_h1]:font-[family-name:var(--font-auth-display)] [&_h1]:font-extrabold [&_h1]:tracking-tight">
        <div className="flex items-center justify-between gap-3">
          <a
            href={MARKETING_SITE_URL}
            className="inline-flex min-h-11 items-center gap-1.5 font-bold text-[#3c4657] hover:text-teal-ink"
          >
            <ArrowLeft className="size-[18px] rtl:rotate-180" aria-hidden="true" />
            {t("Explore AdorWorks")}
          </a>
          <LanguageSwitcher className="[&_select]:rounded-full [&_select]:border-[#e6dfd2] [&_select]:bg-transparent" />
        </div>

        <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center gap-6 py-8">
          {children}

          <div className="flex items-start gap-3 rounded-2xl border border-[#e6dfd2] bg-[#f7f3ec] px-4 py-3.5 text-sm text-[#3c4657]">
            <ShieldCheck className="mt-0.5 size-5 flex-none text-teal-ink" aria-hidden="true" />
            <p>
              {t("AdorWorks will never ask for your password by phone or WhatsApp.")}{" "}
              {t("Trouble signing in?")}{" "}
              <a href={CONTACT_URL} className="font-extrabold text-teal-ink hover:underline">
                {t("Message support")}
              </a>{" "}
              {t("or")}{" "}
              <a href="/assistance/request" className="font-extrabold text-teal-ink hover:underline">
                {t("get in-person help")}
              </a>
              .
            </p>
          </div>
        </div>

        <p className="text-center text-[13px] text-[#7a8394]">
          © 2026 AdorWorks ·{" "}
          <a href={`${MARKETING_SITE_URL}/privacy.html`} className="text-slate hover:underline">
            {t("Privacy")}
          </a>{" "}
          ·{" "}
          <a href={`${MARKETING_SITE_URL}/terms.html`} className="text-slate hover:underline">
            {t("Terms")}
          </a>
        </p>
      </main>
    </div>
  );
}
