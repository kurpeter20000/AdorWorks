import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My applications" };

const STAGE_LABEL: Record<string, string> = {
  submitted: "Submitted — awaiting review",
  shortlisted: "Shortlisted",
  interviewing: "Interviewing",
  offered: "Offer sent — check your offers",
  accepted: "Accepted",
  rejected: "Not selected",
  withdrawn: "Withdrawn",
};

const STAGE_STYLE: Record<string, string> = {
  submitted: "bg-slate/10 text-slate",
  shortlisted: "bg-teal/10 text-teal-ink",
  interviewing: "bg-teal/10 text-teal-ink",
  offered: "bg-violet/10 text-violet",
  accepted: "bg-teal/10 text-teal-ink",
  rejected: "bg-slate/10 text-slate",
  withdrawn: "bg-slate/10 text-slate",
};

export default async function ApplicationsPage() {
  const session = await requireRole("talent");
  const supabase = await createClient();

  const { data: applications } = await supabase
    .from("applications")
    .select("id, opportunity_id, stage, created_at")
    .eq("talent_id", session.userId)
    .order("created_at", { ascending: false });

  const opportunityIds = [...new Set((applications ?? []).map((a) => a.opportunity_id))];
  const { data: opportunities } =
    opportunityIds.length > 0
      ? await supabase.from("opportunities").select("id, title, organisation_id").in("id", opportunityIds)
      : { data: [] };

  const orgIds = [...new Set((opportunities ?? []).map((o) => o.organisation_id))];
  const { data: orgs } =
    orgIds.length > 0 ? await supabase.from("organisations").select("id, name").in("id", orgIds) : { data: [] };

  const opportunityById = new Map((opportunities ?? []).map((o) => [o.id, o]));
  const orgNameById = new Map((orgs ?? []).map((o) => [o.id, o.name]));

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-midnight">My applications</h1>
        <Link href="/opportunities" className="text-sm font-semibold text-teal-ink underline">
          Find more work
        </Link>
      </div>

      {!applications || applications.length === 0 ? (
        <p className="mt-8 text-sm text-slate">
          No applications yet.{" "}
          <Link href="/opportunities" className="font-semibold text-teal-ink underline">
            Browse open opportunities
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {applications.map((a) => {
            const opp = opportunityById.get(a.opportunity_id);
            return (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-xl border border-slate/15 bg-white p-4"
              >
                <div>
                  <p className="font-semibold text-midnight">{opp?.title ?? "Opportunity"}</p>
                  <p className="text-xs text-slate">
                    {opp ? (orgNameById.get(opp.organisation_id) ?? "AdorWorks employer") : ""}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${STAGE_STYLE[a.stage] ?? "bg-slate/10 text-slate"}`}
                >
                  {STAGE_LABEL[a.stage] ?? a.stage}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
