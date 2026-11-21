import { ArrowLeft, Check, ShieldCheck } from "lucide-react";
import { CONTACT_URL, MARKETING_SITE_URL } from "@/lib/domain/marketingSite";
import { HeroVideoBackgroundFrom } from "@/components/hero-video-background";
import { LanguageSwitcher } from "@/components/language-switcher";
import { msg } from "@/i18n/config";
import { getT } from "@/i18n/server";

// Same three promises on both sides of the marketplace — the auth pages
// are the one place login/signup for talent and employers share a single
// shell, so the copy stays role-neutral. Kept short so the panel fits one
// screen.
const VALUE_PROPS = [
  { title: msg("Fair-ranked matching"), body: msg("Matched by skills — never by who pays more.") },
  { title: msg("Paid as work is approved"), body: msg("Written terms and a receipt for every milestone.") },
  { title: msg("Verified from day one"), body: msg("Every profile shows a visible trust level.") },
];

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

      {/* Brand panel: fixed to the screen height so it never scrolls or
          cuts off; a strong gradient keeps the text readable on the video. */}
      <aside className="relative isolate hidden h-dvh flex-col overflow-hidden bg-midnight text-[#f7f3ec] lg:sticky lg:top-0 lg:flex lg:w-[44%] xl:w-[42%]">
        <HeroVideoBackgroundFrom query="(min-width: 1024px)" className="absolute inset-0 -z-20 h-full w-full object-cover" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-[#0b1118] via-[#10171f]/85 to-[#10171f]/55" />
        <div className="flex h-full flex-col px-10 py-9 xl:px-14">
          <a href={MARKETING_SITE_URL} className="self-start text-lg font-extrabold tracking-tight text-[#f7f3ec]">
            AdorWorks
          </a>
          {/* Centred in the panel (owner: move it up), level with the form. */}
          <div className="my-auto flex max-w-[26rem] flex-col gap-7 pb-10">
            <p className="font-[family-name:var(--font-auth-display)] text-4xl leading-[1.08] font-extrabold tracking-tight xl:text-[2.9rem]">
              {t("Talent found.")}
              <br />
              <em className="text-[#7fd8c8] not-italic">{t("Work delivered.")}</em>
            </p>
            <ul className="flex flex-col gap-3.5">
              {VALUE_PROPS.map((item) => (
                <li key={item.title} className="flex items-start gap-3">
                  <span aria-hidden="true" className="mt-0.5 flex size-6 flex-none items-center justify-center rounded-full bg-[#7fd8c8]/15 text-[#7fd8c8]">
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                  <span className="text-[15px] leading-snug">
                    <strong className="block font-bold text-white">{t(item.title)}</strong>
                    <span className="text-white/75">{t(item.body)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="border-t border-white/15 pt-5 text-sm text-white/70">
              {t("Free for talent · Every shortlist reviewed by a person · Paid by MTN MoMo, mGurush or bank")}
            </p>
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

        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-8">
          {children}

          <p className="mt-6 flex items-start gap-2.5 border-t border-[#ece6db] pt-5 text-[13px] leading-relaxed text-[#596274]">
            <ShieldCheck className="mt-0.5 size-4 flex-none text-teal-ink" aria-hidden="true" />
            <span>
              {t("AdorWorks will never ask for your password by phone or WhatsApp.")}{" "}
              {t("Trouble signing in?")}{" "}
              <a href={CONTACT_URL} className="font-bold text-teal-ink underline underline-offset-2">
                {t("Message support")}
              </a>{" "}
              {t("or")}{" "}
              <a href="/assistance/request" className="font-bold text-teal-ink underline underline-offset-2">
                {t("get in-person help")}
              </a>
              .
            </span>
          </p>
        </div>

        <p className="text-center text-[13px] text-[#596274]">
          © 2026 AdorWorks ·{" "}
          <a href={`${MARKETING_SITE_URL}/privacy.html`} className="text-slate underline underline-offset-2 hover:text-midnight">
            {t("Privacy")}
          </a>{" "}
          ·{" "}
          <a href={`${MARKETING_SITE_URL}/terms.html`} className="text-slate underline underline-offset-2 hover:text-midnight">
            {t("Terms")}
          </a>
        </p>
      </main>
    </div>
  );
}
