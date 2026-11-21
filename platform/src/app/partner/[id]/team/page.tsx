import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireSession } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageCohort, partnerProgrammesFor } from "@/lib/dal/pathways";
import { formatDate } from "@/lib/domain/format";
import { getT } from "@/i18n/server";
import { CohortOpenToggle, InviteForm, RemoveButton } from "./team-tools";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Cohort team and join code") };
}

/**
 * Partner self-service (0124): the cohort's join code and QR, and its team.
 * Partner admins invite viewers, admins and facilitators; AdorWorks staff
 * still record background checks and the data-sharing agreement.
 */
export default async function CohortTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const programme = (await partnerProgrammesFor(session.userId, session.role)).find((p) => p.id === id);
  if (!programme) notFound();
  const t = await getT();
  const canManage = await canManageCohort(session.userId, session.role, id);
  const admin = createAdminClient();
  const [{ data: partnerUsers }, { data: facilitators }] = await Promise.all([
    admin.from("programme_partner_users").select("user_id, role").eq("programme_id", id),
    admin.from("programme_facilitators").select("user_id, background_check_recorded_at").eq("programme_id", id),
  ]);
  const ids = [...new Set([...(partnerUsers ?? []), ...(facilitators ?? [])].map((p) => p.user_id))];
  const { data: people } = ids.length ? await admin.from("profiles").select("id, full_name").in("id", ids) : { data: [] as { id: string; full_name: string | null }[] };
  const nameOf = (uid: string) => (people ?? []).find((p) => p.id === uid)?.full_name || t("AdorWorks user");
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const joinUrl = programme.join_code ? `${site}/pathways/join?code=${encodeURIComponent(programme.join_code)}` : null;
  const qr = joinUrl ? await QRCode.toString(joinUrl, { type: "svg", margin: 1, width: 168 }) : null;

  return (
    <main className="mx-auto max-w-3xl p-6 sm:p-8">
      <Link href={`/partner/${id}`} className="text-sm font-bold text-teal-ink underline">
        {t("Back to cohort results")}
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold text-midnight">{t("Cohort team and join code")}</h1>
      <p className="mt-1 text-sm text-slate">
        <span className="no-i18n">{programme.name}</span>
      </p>

      <section className="mt-6 rounded-card border border-line bg-white p-5 shadow-card">
        <h2 className="text-lg font-extrabold text-midnight">{t("How participants join")}</h2>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 text-sm text-midnight">
            <p>{t("1. They create a free AdorWorks account — a phone number is enough.")}</p>
            <p className="mt-1">{t("2. They scan the QR code, or open Passport → Joined a Pathways programme? and type the code:")}</p>
            <p className="mt-2 font-mono text-2xl font-bold tracking-widest">{programme.join_code ?? "—"}</p>
            {!programme.active && <p className="mt-2 text-sm font-semibold text-coral-ink">{t("This cohort is closed to new participants.")}</p>}
            {canManage && (
              <div className="mt-3">
                <CohortOpenToggle programmeId={id} open={programme.active} />
              </div>
            )}
          </div>
          {qr && <div className="shrink-0 rounded-lg border border-line bg-white p-1" aria-label={t("QR code to join")} dangerouslySetInnerHTML={{ __html: qr }} />}
        </div>
      </section>

      <section className="mt-6 rounded-card border border-line bg-white p-5 shadow-card">
        <h2 className="text-lg font-extrabold text-midnight">{t("Team")}</h2>
        <ul className="mt-3 divide-y divide-line text-sm">
          {(partnerUsers ?? []).map((p) => (
            <li key={`p-${p.user_id}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-semibold text-midnight no-i18n">{nameOf(p.user_id)}</span> · {p.role === "admin" ? t("Admin") : t("Viewer")}
              </span>
              {canManage && p.user_id !== session.userId && <RemoveButton programmeId={id} userId={p.user_id} kind="partner" />}
            </li>
          ))}
          {(facilitators ?? []).map((f) => (
            <li key={`f-${f.user_id}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-semibold text-midnight no-i18n">{nameOf(f.user_id)}</span> · {t("Facilitator")} ·{" "}
                {f.background_check_recorded_at ? (
                  <span className="text-teal-ink">{t("background check recorded {date}", { date: formatDate(f.background_check_recorded_at) })}</span>
                ) : (
                  <span className="text-coral-ink">{t("waiting for AdorWorks to record a background check")}</span>
                )}
              </span>
              {canManage && <RemoveButton programmeId={id} userId={f.user_id} kind="facilitator" />}
            </li>
          ))}
          {(partnerUsers ?? []).length + (facilitators ?? []).length === 0 && <li className="py-2 text-slate">{t("No one yet.")}</li>}
        </ul>
        {canManage ? (
          <div className="mt-4">
            <InviteForm programmeId={id} />
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate">{t("Only the cohort's admins can change the team.")}</p>
        )}
        <p className="mt-4 text-xs text-slate">
          {programme.agreement_signed_at
            ? t("Data-sharing agreement signed {date}.", { date: formatDate(programme.agreement_signed_at) })
            : t("Participants' names appear only after the data-sharing agreement with AdorWorks is signed. Contact AdorWorks to arrange it.")}
        </p>
      </section>
    </main>
  );
}
