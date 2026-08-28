import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganisationMembership } from "@/lib/dal/organisation";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/status-badge";
import { APPLICATION_STATES } from "@/lib/domain/states";
import { SCORECARD_CRITERIA } from "@/lib/domain/scorecard";

export const metadata: Metadata = { title: "Compare candidates" };

const CRITERION_LABEL: Record<string, string> = {
  skill_fit: "Skill fit",
  communication: "Communication",
  portfolio_quality: "Portfolio",
  reliability: "Reliability",
};

/** Stage 5: candidate comparison, using the same fixed scorecard criteria as the per-application scoring UI. */
export default async function CompareCandidatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { org } = await requireOrganisationMembership();
  const { id } = await params;
  const supabase = await createClient();

  const { data: opportunity } = await supabase
    .from("opportunities")
    .select("id, title")
    .eq("id", id)
    .eq("organisation_id", org.id)
    .maybeSingle();
  if (!opportunity) notFound();

  const { data: applications } = await supabase
    .from("applications")
    .select("id, talent_id, stage, created_at")
    .eq("opportunity_id", id)
    .order("created_at", { ascending: false });

  const talentIds = [...new Set((applications ?? []).map((a) => a.talent_id))];
  const applicationIds = (applications ?? []).map((a) => a.id);

  const [{ data: talents }, { data: scores }] = await Promise.all([
    talentIds.length > 0
      ? supabase.from("talent_profiles").select("id, display_name, headline, verification_tier").in("id", talentIds)
      : Promise.resolve({ data: [] }),
    applicationIds.length > 0
      ? supabase.from("application_scorecards").select("application_id, criterion, score").in("application_id", applicationIds)
      : Promise.resolve({ data: [] }),
  ]);

  const talentById = new Map((talents ?? []).map((t) => [t.id, t]));

  const scoresByApplication = new Map<string, Record<string, number[]>>();
  for (const s of scores ?? []) {
    const byCriterion = scoresByApplication.get(s.application_id) ?? {};
    (byCriterion[s.criterion] ??= []).push(s.score);
    scoresByApplication.set(s.application_id, byCriterion);
  }

  function average(nums: number[]) {
    return nums.length > 0 ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : "—";
  }

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-8">
      <Link href={`/organisation/opportunities/${id}`} className="text-xs font-semibold text-teal-ink underline">
        &larr; Back to {opportunity.title}
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold text-midnight">Compare candidates</h1>
      <p className="mt-1 text-sm text-slate">
        Scores are the average across everyone on your team who&rsquo;s scored this candidate — add or update scores from
        the opportunity page.
      </p>

      {!applications || applications.length === 0 ? (
        <p className="mt-8 text-sm text-slate">No applicants yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate/15 text-left text-xs uppercase tracking-wide text-slate">
                <th className="py-2 pr-3">Candidate</th>
                <th className="py-2 pr-3">Stage</th>
                {SCORECARD_CRITERIA.map((c) => (
                  <th key={c} className="py-2 pr-3">
                    {CRITERION_LABEL[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {applications.map((a) => {
                const talent = talentById.get(a.talent_id);
                const byCriterion = scoresByApplication.get(a.id) ?? {};
                return (
                  <tr key={a.id} className="border-b border-slate/10">
                    <td className="py-2 pr-3">
                      <Link href={`/passport/${a.talent_id}`} className="font-semibold text-midnight underline decoration-slate/30 hover:decoration-teal">
                        {talent?.display_name ?? "AdorWorks talent"}
                      </Link>
                      <p className="text-xs text-slate">{talent?.headline}</p>
                    </td>
                    <td className="py-2 pr-3">
                      <StatusBadge state={APPLICATION_STATES[a.stage]} />
                    </td>
                    {SCORECARD_CRITERIA.map((c) => (
                      <td key={c} className="py-2 pr-3 font-semibold text-midnight">
                        {average(byCriterion[c] ?? [])}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
