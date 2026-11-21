import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Plus, ShieldCheck } from "lucide-react";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReportButton } from "@/components/report-button";
import { ShareButton } from "../../share-button";
import { ApplyForm } from "./apply-form";
import { formatCompensation, formatDate } from "@/lib/domain/format";
import { fitCheck, FIT_HINT, FIT_LABEL, MAX_OPEN_APPLICATIONS, OPEN_APPLICATION_STAGES } from "@/lib/domain/fitCheck";
import { StatusPill } from "@/components/ui/status";
import { HelpCard } from "@/components/help-card";
import { msg } from "@/i18n/config";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Apply") };
}

const PAY_BASIS: Record<string, string> = {
  fixed: msg("Fixed price for the whole job"),
  milestone: msg("Paid per milestone, as each one is approved"),
  hourly: msg("Paid by the hour"),
  daily: msg("Paid by the day"),
  monthly: msg("Paid monthly"),
  negotiable: msg("Pay to be agreed with the employer"),
};

const WORK_MODE: Record<string, string> = { remote: msg("Remote"), on_site: msg("On site"), hybrid: msg("Hybrid"), any: msg("Remote or on site") };

/** Whole days from now until `date` (rounded up). Server-rendered per request. */
function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

export default async function ApplyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("talent");
  const { id } = await params;
  const t = await getT();
  const supabase = await createClient();

  const { data: opportunity } = await supabase
    .from("opportunities")
    .select(
      "id, title, brief, organisation_id, application_deadline, skills, type, work_mode, location, payment_basis, compensation_amount, compensation_min, compensation_max, currency"
    )
    .eq("id", id)
    .eq("status", "open")
    .eq("visibility", "public")
    .maybeSingle();
  if (!opportunity) {
    notFound();
  }

  const [{ data: questions }, { data: draft }, { data: org }, { data: talentProfile }] = await Promise.all([
    supabase.from("screening_questions").select("id, question, required").eq("opportunity_id", id).order("sequence", { ascending: true }),
    supabase.from("application_drafts").select("pitch, answers").eq("opportunity_id", id).maybeSingle(),
    supabase.from("public_organisation_names").select("name, verification_status").eq("id", opportunity.organisation_id).maybeSingle(),
    supabase.from("talent_profiles").select("skills, headline, location").eq("id", session.userId).maybeSingle(),
  ]);
  // Talent Charter: 10 open applications at most.
  const { count: openCount } = await supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("talent_id", session.userId)
    .eq("source", "applied")
    .in("stage", [...OPEN_APPLICATION_STAGES]);
  const openApplications = openCount ?? 0;

  const admin = createAdminClient();
  const { data: attachmentRows } = await admin
    .from("opportunity_attachments")
    .select("id, path, filename")
    .eq("opportunity_id", opportunity.id)
    .order("created_at", { ascending: false });
  const attachments = await Promise.all(
    (attachmentRows ?? []).map(async (a) => {
      const { data } = await admin.storage.from("opportunity-attachments").createSignedUrl(a.path, 3600);
      return { id: a.id, filename: a.filename, url: data?.signedUrl ?? null };
    })
  );

  // Fit check — skill overlap with the Passport only, never pay.
  const fit = fitCheck(opportunity.skills, talentProfile?.skills);
  const mySkills = new Set((talentProfile?.skills ?? []).map((s) => s.toLowerCase()));
  const asked = fit ? [...fit.have, ...fit.lack] : [];
  const missing = fit?.lack ?? [];

  const deadline = opportunity.application_deadline ? new Date(opportunity.application_deadline) : null;
  const daysLeft = deadline ? daysUntil(deadline) : null;
  const pay = t(formatCompensation(opportunity));
  const chip = "rounded-lg border border-line bg-white px-2.5 py-1";

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <Link href="/opportunities" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-midnight/80 hover:text-midnight">
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
        {t("Back to Find work")}
      </Link>

      {/* Safe-apply guard (spec P1): every opportunity says applying is free, with Report one tap away. */}
      <section role="note" className="mt-3 flex flex-wrap items-center gap-3 rounded-card border border-teal/30 bg-teal/8 px-4 py-3">
        <ShieldCheck className="size-5 shrink-0 text-teal-ink" aria-hidden="true" />
        <p className="min-w-0 flex-[1_1_18rem] text-sm text-midnight">
          <strong>{t("Applying is always free.")}</strong>{" "}
          {t("AdorWorks and its employers will never ask you to pay to apply or to start work. Talk only through AdorWorks.")}
        </p>
        <ReportButton targetType="opportunity" targetId={opportunity.id} />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5 lg:items-start">
        <div className="min-w-0 space-y-5 lg:col-span-3">
          <header>
            {org && (
              <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-midnight">
                {org.name}
                {org.verification_status === "verified" && (
                  <span title={t("This organisation has completed AdorWorks verification.")}>
                    <StatusPill tone="done">{t("Verified employer")}</StatusPill>
                  </span>
                )}
              </p>
            )}
            <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight text-midnight sm:text-3xl">
              <span className="no-i18n">{opportunity.title}</span>
            </h1>
            <div className="mt-3 flex flex-wrap gap-2 text-[13px] font-bold text-midnight/80">
              <span className={chip}>{pay}</span>
              {opportunity.work_mode && <span className={chip}>{t(WORK_MODE[opportunity.work_mode] ?? opportunity.work_mode)}</span>}
              {opportunity.location && <span className={chip}>{opportunity.location}</span>}
              {deadline && daysLeft !== null && (
                <span className={daysLeft <= 7 ? "rounded-lg bg-coral/12 px-2.5 py-1 text-coral-ink" : chip}>
                  {daysLeft <= 7 && daysLeft >= 0
                    ? daysLeft <= 1
                      ? t("Closes today")
                      : t("Closes in {n} days", { n: daysLeft })
                    : t("Apply by {date}", { date: formatDate(deadline, { day: "numeric", month: "short", year: "numeric" }) })}
                </span>
              )}
            </div>
          </header>

          {asked.length > 0 && (
            <section aria-labelledby="match-h" className="space-y-3 rounded-card border border-line bg-white p-5 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="match-h" className="text-lg font-extrabold text-midnight">
                  {t("Fit check")}
                </h2>
                {fit && (
                  <span className="flex items-center gap-2">
                    <StatusPill tone={fit.level === "good" ? "done" : fit.level === "stretch" ? "waiting" : "neutral"}>{t(FIT_LABEL[fit.level])}</StatusPill>
                    <span className="text-xs font-bold text-slate">{t("{matched} of {asked} skills", { matched: fit.have.length, asked: fit.total })}</span>
                  </span>
                )}
              </div>
              {fit && <p className="text-sm text-midnight">{t(FIT_HINT[fit.level])}</p>}
              <p className="text-[13px] text-slate">{t("Based only on skill overlap with your Passport — never on pay or reputation.")}</p>
              <ul className="flex flex-wrap gap-2">
                {asked.map((skill) => {
                  const have = mySkills.has(skill.toLowerCase());
                  return (
                    <li
                      key={skill}
                      className={
                        have
                          ? "inline-flex items-center gap-1.5 rounded-full bg-teal/12 px-3 py-1 text-[13px] font-bold text-teal-ink"
                          : "inline-flex items-center gap-1.5 rounded-full border border-dashed border-warning bg-amber-tint px-3 py-1 text-[13px] font-bold text-warning-ink"
                      }
                    >
                      {have ? <Check className="size-3.5" aria-hidden="true" /> : <Plus className="size-3.5" aria-hidden="true" />}
                      {skill}
                      <span className="sr-only">{have ? t("(on your Passport)") : t("(not on your Passport yet)")}</span>
                    </li>
                  );
                })}
              </ul>
              {missing.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-control bg-amber-tint/60 px-4 py-3">
                  <p className="min-w-0 flex-[1_1_16rem] text-sm text-midnight">
                    <strong>{t("Missing: {skills}.", { skills: missing.join(", ") })}</strong> {t("You can still apply. If you have this skill, add proof to your Passport.")}
                  </p>
                  <Link href="/passport" className="inline-flex min-h-10 items-center rounded-control border border-slate/30 bg-white px-3 text-sm font-bold text-midnight hover:bg-cloud">
                    {t("Update Passport")}
                  </Link>
                </div>
              )}
            </section>
          )}

          {opportunity.brief && (
            <section aria-labelledby="work-h" className="rounded-card border border-line bg-white p-5 shadow-card">
              <h2 id="work-h" className="text-lg font-extrabold text-midnight">
                {t("What you'll do")}
              </h2>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-midnight/85">{opportunity.brief}</p>
              {attachments.some((a) => a.url) && (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="text-xs font-extrabold tracking-wider text-slate uppercase">{t("Attachments")}</p>
                  <ul className="mt-1.5 space-y-1">
                    {attachments.map((a) =>
                      a.url ? (
                        <li key={a.id}>
                          <a href={a.url} className="text-sm font-bold text-teal-ink underline" target="_blank" rel="noreferrer">
                            {a.filename}
                          </a>
                        </li>
                      ) : null
                    )}
                  </ul>
                </div>
              )}
            </section>
          )}

          <section aria-labelledby="pay-h" className="rounded-card border border-line bg-white p-5 shadow-card">
            <h2 id="pay-h" className="text-lg font-extrabold text-midnight">
              {t("How you get paid")}
            </h2>
            <p className="mt-2 text-xl font-extrabold text-midnight">{pay}</p>
            {opportunity.payment_basis && <p className="mt-0.5 text-sm text-slate">{t(PAY_BASIS[opportunity.payment_basis] ?? opportunity.payment_basis)}</p>}
            <p className="mt-3 text-[13px] text-slate">{t("Money is released when work is approved, with a receipt every time. Track it in Finance.")}</p>
          </section>
        </div>

        <aside className="min-w-0 space-y-4 lg:col-span-2">
          <section aria-labelledby="apply-h" className="rounded-card border border-line bg-white p-5 shadow-raised">
            <h2 id="apply-h" className="text-lg font-extrabold text-midnight">
              {t("Apply in 3 steps")}
            </h2>
            <p className={`mt-1 text-xs font-semibold ${openApplications >= MAX_OPEN_APPLICATIONS ? "text-coral-ink" : "text-slate"}`}>
              {openApplications >= MAX_OPEN_APPLICATIONS
                ? t("You have {n} open applications — the most allowed. Withdraw one or wait for an answer to apply here.", { n: openApplications })
                : t("{n} of {max} open applications used.", { n: openApplications, max: MAX_OPEN_APPLICATIONS })}
            </p>
            <ApplyForm
              opportunityId={opportunity.id}
              questions={questions ?? []}
              initialPitch={draft?.pitch ?? ""}
              initialAnswers={draft?.answers ?? {}}
              passport={{
                name: session.fullName ?? null,
                headline: talentProfile?.headline ?? null,
                location: talentProfile?.location ?? null,
                skills: talentProfile?.skills ?? [],
              }}
            />
            <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
              <ShareButton opportunityId={opportunity.id} />
            </div>
          </section>

          <section aria-labelledby="after-h" className="rounded-card border border-line bg-white p-5">
            <h2 id="after-h" className="text-base font-extrabold text-midnight">
              {t("What happens after you apply")}
            </h2>
            <ol className="mt-2 list-decimal space-y-1 ps-5 text-sm text-midnight/85">
              <li>{t("The employer sees your Passport and your answers.")}</li>
              <li>{t("You get a notification and an email when your application moves forward or closes.")}</li>
              <li>{t("If you are shortlisted, you may be invited to an interview.")}</li>
            </ol>
          </section>

          <HelpCard audience="talent" />
        </aside>
      </div>
    </main>
  );
}
