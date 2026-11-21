import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/dal/session";
import { partnerOrgsAdminedBy, partnerProgrammesFor } from "@/lib/dal/pathways";
import { createAdminClient } from "@/lib/supabase/admin";
import { NewCohortForm } from "./new-cohort-form";
import { PROGRAMME_TYPES, type ProgrammeType } from "@/lib/domain/pathways";
import { formatDate } from "@/lib/domain/format";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Programme dashboard") };
}

/** Programme partner dashboard: the cohorts this person can see (staff see all). */
export default async function PartnerHomePage() {
  const session = await requireSession();
  const [programmes, orgIds] = await Promise.all([partnerProgrammesFor(session.userId, session.role), partnerOrgsAdminedBy(session.userId)]);
  if (programmes.length === 0 && orgIds.length === 0) notFound();
  const { data: orgs } = orgIds.length ? await createAdminClient().from("organisations").select("id, name").in("id", orgIds) : { data: [] as { id: string; name: string }[] };
  const t = await getT();
  return (
    <main className="mx-auto max-w-3xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">{t("Programme dashboard")}</h1>
      <p className="mt-1 text-sm text-slate">{t("Verified outcomes for your cohorts. Group totals only — never groups under 5, and names only with each person's consent.")}</p>
      {(orgs ?? []).length > 0 && (
        <div className="mt-6">
          <NewCohortForm orgs={orgs ?? []} />
        </div>
      )}
      {programmes.length === 0 && <p className="mt-6 text-sm text-slate">{t("No cohorts yet. Create your first one to get a join code for participants.")}</p>}
      <ul className="mt-6 space-y-3">
        {programmes.map((p) => (
          <li key={p.id}>
            <Link href={`/partner/${p.id}`} className="block rounded-card border border-line bg-white p-5 shadow-card hover:border-teal/40">
              <p className="font-extrabold text-midnight">
                <span className="no-i18n">{p.name}</span>
              </p>
              <p className="mt-1 text-sm text-slate">
                {t(PROGRAMME_TYPES[(p.programme_type ?? "other") as ProgrammeType] ?? PROGRAMME_TYPES.other)} · <span className="no-i18n">{p.partner_name}</span>
                {p.starts_on ? ` · ${formatDate(p.starts_on)}` : ""}
                {p.ends_on ? ` – ${formatDate(p.ends_on)}` : ""}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
