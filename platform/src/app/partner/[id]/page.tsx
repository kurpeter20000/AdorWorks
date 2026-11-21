import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadParticipantFacts, partnerProgrammesFor } from "@/lib/dal/pathways";
import { buildPartnerReport, PROGRAMME_TYPES, type ProgrammeType } from "@/lib/domain/pathways";
import { MIN_GROUP_SIZE } from "@/lib/domain/programmeConsent";
import { CATEGORY_LABEL } from "@/lib/domain/taxonomy";
import { formatDate, formatMoney } from "@/lib/domain/format";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Cohort results") };
}

/**
 * One cohort on the programme partner dashboard (competitive brief):
 * header, outcome funnel, tiles, breakdowns and consented names — all
 * through buildPartnerReport()'s privacy floor.
 */
export default async function PartnerCohortPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const programme = (await partnerProgrammesFor(session.userId, session.role)).find((p) => p.id === id);
  if (!programme) notFound();
  const t = await getT();
  const report = buildPartnerReport(await loadParticipantFacts(createAdminClient(), id), programme.agreement_signed_at !== null);
  const top = report.funnel[0]?.count || 1;
  const earned = Object.entries(report.earnings);

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-8">
      <Link href="/partner" className="text-sm font-bold text-teal-ink underline">
        {t("All programmes")}
      </Link>
      <header className="mt-3 rounded-card border border-line bg-white p-5 shadow-card">
        <p className="text-xs font-extrabold tracking-wider text-slate uppercase">{t(PROGRAMME_TYPES[(programme.programme_type ?? "other") as ProgrammeType] ?? PROGRAMME_TYPES.other)}</p>
        <h1 className="mt-1 text-2xl font-extrabold text-midnight">
          <span className="no-i18n">{programme.name}</span>
        </h1>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate">{t("Partner")}</dt>
            <dd className="font-semibold text-midnight no-i18n">{programme.partner_name}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate">{t("Funder")}</dt>
            <dd className="font-semibold text-midnight no-i18n">{programme.funder || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate">{t("Period")}</dt>
            <dd className="font-semibold text-midnight">
              {programme.starts_on ? formatDate(programme.starts_on) : "—"} – {programme.ends_on ? formatDate(programme.ends_on) : t("ongoing")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate">{t("Region")}</dt>
            <dd className="font-semibold text-midnight no-i18n">{programme.region || "—"}</dd>
          </div>
        </dl>
      </header>

      {!report.visible ? (
        <p className="mt-6 rounded-card border border-line bg-white p-5 text-sm text-slate">
          {t("{n} people have joined so far. Results appear once at least {min} people are enrolled, so nobody can be identified.", { n: report.members, min: MIN_GROUP_SIZE })}
        </p>
      ) : (
        <>
          <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label={t("Key results")}>
            <Tile label={t("Enrolled")} value={String(report.members)} />
            <Tile label={t("Placed in work")} value={programme.target_placed ? `${report.placed} / ${programme.target_placed}` : String(report.placed)} />
            <Tile label={t("Total earned")} value={earned.length ? earned.map(([c, v]) => formatMoney(v, c)).join(" · ") : "—"} />
            <Tile label={t("Median days to first paid work")} value={report.medianDaysToFirstPay !== null ? String(report.medianDaysToFirstPay) : "—"} />
          </section>

          <section className="mt-6 rounded-card border border-line bg-white p-5 shadow-card" aria-labelledby="funnel-h">
            <h2 id="funnel-h" className="text-lg font-extrabold text-midnight">
              {t("Outcome funnel")}
            </h2>
            <ol className="mt-3 space-y-2">
              {report.funnel.map((f) => (
                <li key={f.key} className="text-sm">
                  <div className="flex justify-between">
                    <span className="font-semibold text-midnight">{t(f.label)}</span>
                    <span className="font-bold text-midnight">{f.count}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-cloud">
                    <div className="h-2 rounded-full bg-teal" style={{ width: `${Math.round((f.count / top) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-6 grid gap-4 sm:grid-cols-2">
            {report.breakdown.map((b) => (
              <div key={b.by} className="rounded-card border border-line bg-white p-5 shadow-card">
                <h2 className="font-extrabold text-midnight">{b.by === "category" ? t("By skill area") : t("By location")}</h2>
                {b.rows.length === 0 ? (
                  <p className="mt-2 text-sm text-slate">{t("Every group is under {min} people, so none are shown.", { min: MIN_GROUP_SIZE })}</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {b.rows.map((r) => (
                      <li key={r.value} className="flex justify-between">
                        <span className="no-i18n">{b.by === "category" ? t(CATEGORY_LABEL[r.value as keyof typeof CATEGORY_LABEL] ?? r.value) : r.value}</span>
                        <span className="font-bold">{r.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>

          <section className="mt-6 rounded-card border border-line bg-white p-5 shadow-card">
            <h2 className="font-extrabold text-midnight">{t("Participants who agreed to share their progress")}</h2>
            {!programme.agreement_signed_at ? (
              <p className="mt-2 text-sm text-slate">{t("Names appear here once the data-sharing agreement with AdorWorks is signed.")}</p>
            ) : report.named.length === 0 ? (
              <p className="mt-2 text-sm text-slate">{t("No one has chosen to share their name yet.")}</p>
            ) : (
              <ul className="mt-2 divide-y divide-line text-sm">
                {report.named.map((n) => (
                  <li key={n.talentId} className="flex flex-wrap justify-between gap-2 py-2">
                    <span className="font-semibold text-midnight no-i18n">{n.name}</span>
                    <span className="text-slate">
                      {n.placed ? t("Placed") : t("Not placed yet")} · {n.paid ? t("Paid") : t("Not paid yet")}
                      {n.earnings && Object.keys(n.earnings).length > 0 ? ` · ${Object.entries(n.earnings).map(([c, v]) => formatMoney(v, c)).join(", ")}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {report.storiesAgreed > 0 && <p className="mt-2 text-xs text-slate">{t("{n} participants are open to sharing their story — ask AdorWorks to arrange it.", { n: report.storiesAgreed })}</p>}
          </section>

          <p className="mt-6">
            <a href={`/partner/${programme.id}/report.csv`} className="inline-flex min-h-11 items-center rounded-control bg-teal px-4 text-sm font-bold text-midnight">
              {t("Download donor report (CSV)")}
            </a>
          </p>
        </>
      )}
    </main>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-line bg-white p-4 shadow-card">
      <p className="text-xs font-semibold text-slate">{label}</p>
      <p className="mt-1 text-xl font-extrabold text-midnight">{value}</p>
    </div>
  );
}
