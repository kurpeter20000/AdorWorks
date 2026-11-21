import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { VerificationTier } from "@/lib/database.types";
import { formatDate } from "@/lib/domain/format";
import { msg } from "@/i18n/config";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Verify this person"), robots: { index: false } };
}

/** The five-tier ladder, lowest first (Talent Charter: tier checkable in one click). */
const LADDER: { tier: VerificationTier; label: string; meaning: string }[] = [
  { tier: "registered", label: msg("Registered"), meaning: msg("Has an AdorWorks account.") },
  { tier: "identity_verified", label: msg("Identity verified"), meaning: msg("AdorWorks checked their ID document.") },
  { tier: "adorverified", label: msg("AdorVerified"), meaning: msg("Identity plus a reference or skills check confirmed by our team.") },
  { tier: "adorcertified", label: msg("AdorCertified"), meaning: msg("Proven through completed paid work and reviews, confirmed by our team.") },
  { tier: "team_lead", label: msg("Team lead"), meaning: msg("Trusted to lead AdorWorks teams.") },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public "Verify this person" page (Talent Charter, 0118). Signed-out
 * visitors can open it. Shows only what verify_person() returns — name,
 * tier, member since, completed contracts — never contact details.
 */
export default async function VerifyPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getT();
  const supabase = await createClient();
  const { data } = UUID.test(id) ? await supabase.rpc("verify_person", { p_id: id }) : { data: null };
  const person = data?.[0] ?? null;
  const checkedOn = formatDate(new Date(), { day: "numeric", month: "long", year: "numeric" });

  if (!person) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6">
        <div className="rounded-card border border-line bg-white p-6 text-center shadow-card">
          <h1 className="text-xl font-extrabold text-midnight">{t("We couldn't verify this link")}</h1>
          <p className="mt-2 text-sm text-slate">
            {t("This person isn't on AdorWorks, or their account is not active. Ask them to send you their link again.")}
          </p>
        </div>
      </main>
    );
  }

  const rank = LADDER.findIndex((l) => l.tier === person.verification_tier);
  const current = LADDER[Math.max(rank, 0)];
  const strong = rank >= 2;

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10 sm:px-6">
      <p className="text-center text-xs font-extrabold tracking-wider text-slate uppercase">{t("AdorWorks verification check")}</p>
      <section className="mt-3 rounded-card border border-line bg-white p-6 shadow-raised">
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className={`flex size-14 shrink-0 items-center justify-center rounded-full text-xl font-extrabold ${strong ? "bg-teal/12 text-teal-ink" : "bg-cloud text-slate"}`}
          >
            {person.name.trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold text-midnight">
              <span className="no-i18n">{person.name}</span>
            </h1>
            <p className={`mt-1 inline-flex items-center gap-1.5 text-sm font-bold ${strong ? "text-teal-ink" : "text-slate"}`}>
              <ShieldCheck className="size-4" aria-hidden="true" />
              {t(current.label)}
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm text-midnight">{t(current.meaning)}</p>

        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-control bg-cloud px-3 py-2">
            <dt className="text-xs font-bold text-slate">{t("On AdorWorks since")}</dt>
            <dd className="font-extrabold text-midnight">{formatDate(person.member_since, { month: "long", year: "numeric" })}</dd>
          </div>
          <div className="rounded-control bg-cloud px-3 py-2">
            <dt className="text-xs font-bold text-slate">{t("Completed contracts")}</dt>
            <dd className="font-extrabold text-midnight">{person.completed_contracts}</dd>
          </div>
        </dl>

        <ol className="mt-6 space-y-2" aria-label={t("Trust tiers")}>
          {LADDER.map((l, i) => (
            <li key={l.tier} className="flex items-center gap-3 text-sm">
              <span
                aria-hidden="true"
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                  i <= rank ? "bg-teal text-white" : "border border-line bg-white text-slate"
                }`}
              >
                {i + 1}
              </span>
              <span className={i === rank ? "font-extrabold text-midnight" : i < rank ? "text-midnight" : "text-slate"}>
                {t(l.label)}
                {i === rank && <span className="sr-only"> {t("(current tier)")}</span>}
              </span>
            </li>
          ))}
        </ol>

        <p className="mt-6 border-t border-line pt-4 text-xs text-slate">
          {t("Checked on {date}. AdorWorks never shows contact details here — to work with this person, hire them through AdorWorks.", { date: checkedOn })}
        </p>
      </section>
      <p className="mt-4 text-center text-sm">
        <Link href="/" className="font-bold text-teal-ink underline">
          {t("What is AdorWorks?")}
        </Link>
      </p>
    </main>
  );
}
