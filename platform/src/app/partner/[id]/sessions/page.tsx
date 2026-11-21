import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireSession } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { canRunSessions, partnerProgrammesFor } from "@/lib/dal/pathways";
import { formatDateTime } from "@/lib/domain/format";
import { getT } from "@/i18n/server";
import { CheckinToggle, IssueCertificate, MarkByPhone, NewSessionForm } from "./session-tools";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Sessions and attendance") };
}

/**
 * Pathways sessions (0123). Facilitators (with a recorded background
 * check) and staff add sessions, show the QR / code for check-in, mark
 * someone present by phone, and issue certificates. Partner staff without
 * facilitator access see the attendance numbers only.
 */
export default async function SessionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const programme = (await partnerProgrammesFor(session.userId, session.role)).find((p) => p.id === id);
  if (!programme) notFound();
  const t = await getT();
  const runner = await canRunSessions(session.userId, session.role, id);
  const admin = createAdminClient();
  const { data: sessions } = await admin.from("programme_sessions").select("*").eq("programme_id", id).order("starts_at", { ascending: false });
  const ids = (sessions ?? []).map((s) => s.id);
  const { data: attendance } = ids.length
    ? await admin.from("programme_attendance").select("session_id, feedback_score").in("session_id", ids)
    : { data: [] as { session_id: string; feedback_score: number | null }[] };
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const cards = await Promise.all(
    (sessions ?? []).map(async (s) => {
      const rows = (attendance ?? []).filter((a) => a.session_id === s.id);
      const scores = rows.map((r) => r.feedback_score).filter((x): x is number => x !== null);
      const qr = runner ? await QRCode.toString(`${site}/pathways/checkin?code=${encodeURIComponent(s.checkin_code)}`, { type: "svg", margin: 1, width: 168 }) : null;
      return { s, present: rows.length, avg: scores.length >= 5 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null, qr };
    })
  );

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-8">
      <Link href={`/partner/${id}`} className="text-sm font-bold text-teal-ink underline">
        {t("Back to cohort results")}
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold text-midnight">{t("Sessions and attendance")}</h1>
      <p className="mt-1 text-sm text-slate">
        <span className="no-i18n">{programme.name}</span>
      </p>

      {runner ? (
        <section className="mt-6 space-y-3">
          <NewSessionForm programmeId={id} />
        </section>
      ) : (
        <p className="mt-4 rounded-card border border-line bg-white p-4 text-sm text-slate">
          {t("To run sessions, AdorWorks staff add you as a facilitator and record your background check.")}
        </p>
      )}

      <ul className="mt-6 space-y-4">
        {cards.length === 0 && <li className="text-sm text-slate">{t("No sessions yet.")}</li>}
        {cards.map(({ s, present, avg, qr }) => (
          <li key={s.id} className="rounded-card border border-line bg-white p-5 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-extrabold text-midnight">
                  <span className="no-i18n">{s.title}</span>
                </p>
                <p className="text-sm text-slate">
                  {formatDateTime(s.starts_at)}
                  {s.location ? <span className="no-i18n"> · {s.location}</span> : null}
                </p>
                <p className="mt-2 text-sm text-midnight">
                  {t("{n} checked in", { n: present })}
                  {avg ? ` · ${t("Rated {avg}/5", { avg })}` : ""}
                </p>
                {runner && (
                  <>
                    <p className="mt-3 text-sm text-midnight">
                      {t("Check-in code")}: <span className="rounded bg-cloud px-2 py-0.5 font-mono text-lg font-bold tracking-widest">{s.checkin_code}</span>
                      {!s.checkin_open && <span className="ms-2 text-xs font-semibold text-coral-ink">{t("Closed")}</span>}
                    </p>
                    <p className="mt-1 text-xs text-slate">{t("Participants scan the QR code, or open AdorWorks and enter the code under Passport → Check in to a session.")}</p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <CheckinToggle sessionId={s.id} open={s.checkin_open} />
                    </div>
                    <div className="mt-3">
                      <MarkByPhone sessionId={s.id} />
                    </div>
                  </>
                )}
              </div>
              {qr && <div className="shrink-0 rounded-lg border border-line bg-white p-1" aria-label={t("QR code for check-in")} dangerouslySetInnerHTML={{ __html: qr }} />}
            </div>
          </li>
        ))}
      </ul>

      {runner && (
        <section className="mt-8 rounded-card border border-line bg-white p-5 shadow-card">
          <h2 className="text-lg font-extrabold text-midnight">{t("Certificates")}</h2>
          <p className="mt-1 text-sm text-slate">{t("Issue a certificate when a participant has finished the programme. Anyone can check it on the AdorWorks Verify page.")}</p>
          <div className="mt-3">
            <IssueCertificate programmeId={id} />
          </div>
        </section>
      )}
    </main>
  );
}
