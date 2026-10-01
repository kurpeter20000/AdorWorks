import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { ENGAGEMENT_TYPE_LABEL, WORK_MODE_LABEL } from "@/lib/domain/taxonomy";
import { ApplyButton } from "../apply-button";
import { SaveButton } from "../save-button";
import { formatCompensation } from "@/lib/domain/format";
import { getT } from "@/i18n/server";
import { rich } from "@/i18n/rich";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Saved opportunities") };
}

export default async function SavedOpportunitiesPage() {
  const session = await requireRole("talent");
  const supabase = await createClient();
  const t = await getT();

  const { data: saved } = await supabase
    .from("saved_opportunities")
    .select("opportunity_id")
    .eq("talent_id", session.userId)
    .order("created_at", { ascending: false });

  const opportunityIds = (saved ?? []).map((s) => s.opportunity_id);

  const [{ data: opportunities }, { data: orgs }, { data: myApplications }] = await Promise.all([
    opportunityIds.length > 0
      ? supabase
          .from("opportunities")
          .select(
            "id, title, brief, category, skills, location, work_mode, engagement_type, payment_basis, compensation_amount, compensation_min, compensation_max, currency, organisation_id"
          )
          .in("id", opportunityIds)
      : Promise.resolve({ data: [] }),
    supabase.from("public_organisation_names").select("id, name"),
    supabase.from("applications").select("opportunity_id").eq("talent_id", session.userId),
  ]);

  const orgNames = new Map((orgs ?? []).map((o) => [o.id, o.name]));
  const appliedIds = new Set((myApplications ?? []).map((a) => a.opportunity_id));
  // Preserve save order (most recently saved first) rather than the opportunities query's own order.
  const byId = new Map((opportunities ?? []).map((o) => [o.id, o]));
  const ordered = opportunityIds.map((id) => byId.get(id)).filter((o): o is NonNullable<typeof o> => !!o);

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-midnight">{t("Saved opportunities")}</h1>
        <Link href="/opportunities" className="text-sm font-semibold text-teal-ink underline">
          {t("Find work")}
        </Link>
      </div>

      {ordered.length === 0 ? (
        <p className="mt-8 text-sm text-slate">
          {rich(t("Nothing saved yet. <browse>Browse open opportunities</browse> and save the ones you want to come back to."), {
            browse: (text) => (
              <Link href="/opportunities" className="font-semibold text-teal-ink underline">
                {text}
              </Link>
            ),
          })}
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {ordered.map((o) => (
            <li key={o.id} className="rounded-xl border border-slate/15 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-bold text-midnight">{o.title}</p>
                  <p className="text-xs text-slate">{orgNames.get(o.organisation_id) ?? t("AdorWorks employer")}</p>
                </div>
                <span className="whitespace-nowrap text-sm font-semibold text-teal-ink">{t(formatCompensation(o))}</span>
              </div>
              {o.brief && <p className="mt-2 line-clamp-3 text-sm text-slate">{o.brief}</p>}
              <div className="mt-3 flex items-center justify-between">
                <p className="text-xs text-slate">
                  {[o.location, o.work_mode && t(WORK_MODE_LABEL[o.work_mode]), o.engagement_type && t(ENGAGEMENT_TYPE_LABEL[o.engagement_type])]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="flex items-center gap-3">
                  <SaveButton opportunityId={o.id} initialSaved={true} />
                  <ApplyButton opportunityId={o.id} alreadyApplied={appliedIds.has(o.id)} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
