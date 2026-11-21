import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { isProgrammeSharingEnabled } from "@/lib/dal/settings";
import { COMPANY_NAME, MIN_GROUP_SIZE, RETENTION_MONTHS } from "@/lib/domain/programmeConsent";
import { formatDate } from "@/lib/domain/format";
import { getT } from "@/i18n/server";
import { ConsentForm } from "./consent-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Programme sharing") };
}

/**
 * Settings → Programme sharing (0120; PAYMENTS-FEES-GUARANTEE-CONSENT §4).
 * Asked separately from sign-up, in the person's language, nothing
 * pre-ticked, changeable any time. Hidden until staff switch it on.
 */
export default async function ProgrammeSharingPage() {
  const session = await requireRole("talent");
  if (!(await isProgrammeSharingEnabled())) notFound();
  const t = await getT();
  const supabase = await createClient();

  const { data: memberships } = await supabase.from("programme_members").select("programme_id, is_minor").eq("talent_id", session.userId);
  const ids = (memberships ?? []).map((m) => m.programme_id);
  const [{ data: programmes }, { data: consents }] = await Promise.all([
    ids.length ? supabase.from("programmes").select("id, name, partner_name").in("id", ids) : Promise.resolve({ data: [] as { id: string; name: string; partner_name: string }[] }),
    ids.length
      ? supabase.from("programme_consents").select("programme_id, share_named_progress, share_earnings, share_story, created_at, guardian_name").in("programme_id", ids).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { programme_id: string; share_named_progress: boolean; share_earnings: boolean; share_story: boolean; created_at: string; guardian_name: string | null }[] }),
  ]);

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">{t("Programme sharing")}</h1>
      {(programmes ?? []).length === 0 && <p className="mt-3 text-sm text-slate">{t("You didn't join AdorWorks through a programme, so there's nothing to share.")}</p>}

      {(programmes ?? []).map((p) => {
        const latest = (consents ?? []).find((c) => c.programme_id === p.id) ?? null;
        const minor = (memberships ?? []).find((m) => m.programme_id === p.id)?.is_minor ?? false;
        return (
          <section key={p.id} className="mt-6 rounded-card border border-line bg-white p-5 shadow-card">
            <h2 className="text-lg font-extrabold text-midnight">{t("Share your progress with {partner}?", { partner: p.partner_name })}</h2>
            <p className="mt-2 text-sm text-midnight">
              {t("You joined AdorWorks through {programme}, run by {partner}. They want to see how the programme is helping people find paid work.", {
                programme: p.name,
                partner: p.partner_name,
              })}
            </p>
            <p className="mt-3 text-sm text-midnight">
              <strong>{t("Always shared, without your name:")}</strong>{" "}
              {t("totals for the whole group, such as how many people were verified, placed and paid. Groups smaller than {n} people are never shown.", { n: MIN_GROUP_SIZE })}
            </p>

            <ConsentForm
              programmeId={p.id}
              current={latest ? { share_named_progress: latest.share_named_progress, share_earnings: latest.share_earnings, share_story: latest.share_story } : null}
            />

            {minor && !latest?.guardian_name && (
              <p className="mt-3 rounded-control bg-amber-tint/60 px-3 py-2 text-sm text-midnight">
                {t("Because you're under 18, nothing with your name is shared until your parent or guardian also agrees. AdorWorks staff will ask them in person.")}
              </p>
            )}

            <p className="mt-4 text-sm text-midnight">
              <strong>{t("Never shared:")}</strong> {t("your ID documents, phone number, email, mobile money or bank details, or messages.")}
            </p>
            <p className="mt-2 text-sm text-slate">
              {t("You can change these choices at any time here. Saying no will not change your access to jobs, verification or payments.")}
            </p>
            {latest && <p className="mt-2 text-xs text-slate">{t("Last saved {date}.", { date: formatDate(latest.created_at) })}</p>}

            <details className="mt-4 rounded-control border border-line px-4 py-3 text-sm">
              <summary className="cursor-pointer font-bold text-midnight">{t("Read the full notice")}</summary>
              <ol className="mt-3 list-decimal space-y-2 ps-5 text-midnight/90">
                <li>{t("Who: AdorWorks, a venture of {company}, shares with {partner}, which runs {programme}.", { company: COMPANY_NAME, partner: p.partner_name, programme: p.name })}</li>
                <li>{t("Why: to track the programme's results, report to its funders and improve support for participants.")}</li>
                <li>{t("What: group totals always (never for groups under {n}); information with your name only for the boxes you ticked.", { n: MIN_GROUP_SIZE })}</li>
                <li>{t("Never shared: ID documents, contact details, payment details, messages, or other people's information.")}</li>
                <li>{t("How long: for the programme and up to {months} months after it ends, then deleted or made anonymous.", { months: RETENTION_MONTHS })}</li>
                <li>{t("Your rights: change or withdraw your choices here at any time. Withdrawing stops future sharing. Questions: contact AdorWorks Support.")}</li>
              </ol>
            </details>
          </section>
        );
      })}
    </main>
  );
}
