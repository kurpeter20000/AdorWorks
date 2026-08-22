import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { ApplyButton } from "../apply-button";
import { SaveButton } from "../save-button";

export const metadata: Metadata = { title: "Saved opportunities" };

function formatCompensation(o: {
  payment_basis: string | null;
  compensation_amount: number | null;
  compensation_min: number | null;
  compensation_max: number | null;
  currency: string | null;
}) {
  const currency = o.currency || "SSP";
  if (o.compensation_amount) return `${currency} ${o.compensation_amount.toLocaleString()}`;
  if (o.compensation_min && o.compensation_max) {
    return `${currency} ${o.compensation_min.toLocaleString()}–${o.compensation_max.toLocaleString()}`;
  }
  if (o.payment_basis === "negotiable") return "Negotiable";
  return "Paid — details on application";
}

export default async function SavedOpportunitiesPage() {
  const session = await requireRole("talent");
  const supabase = await createClient();

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
    supabase.from("organisations").select("id, name"),
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
        <h1 className="text-2xl font-extrabold text-midnight">Saved opportunities</h1>
        <Link href="/opportunities" className="text-sm font-semibold text-teal underline">
          Find work
        </Link>
      </div>

      {ordered.length === 0 ? (
        <p className="mt-8 text-sm text-slate">
          Nothing saved yet.{" "}
          <Link href="/opportunities" className="font-semibold text-teal underline">
            Browse open opportunities
          </Link>{" "}
          and save the ones you want to come back to.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {ordered.map((o) => (
            <li key={o.id} className="rounded-xl border border-slate/15 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-bold text-midnight">{o.title}</p>
                  <p className="text-xs text-slate">{orgNames.get(o.organisation_id) ?? "AdorWorks employer"}</p>
                </div>
                <span className="whitespace-nowrap text-sm font-semibold text-teal">{formatCompensation(o)}</span>
              </div>
              {o.brief && <p className="mt-2 line-clamp-3 text-sm text-slate">{o.brief}</p>}
              <div className="mt-3 flex items-center justify-between">
                <p className="text-xs text-slate">
                  {[o.location, o.work_mode, o.engagement_type?.replace("_", " ")].filter(Boolean).join(" · ")}
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
