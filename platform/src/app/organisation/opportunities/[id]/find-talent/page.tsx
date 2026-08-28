import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireOrganisationMembership } from "@/lib/dal/organisation";
import { createClient } from "@/lib/supabase/server";
import { AddToShortlistButton } from "./add-to-shortlist-button";

export const metadata: Metadata = { title: "Find talent" };

/**
 * Stage 4: employer self-service talent search (0046) — the same
 * capability staff already had in the staff console for building a
 * shortlist, extended to the opportunity's own employer, but only when
 * they've chosen self-service shortlisting for it (curated shortlist
 * stays the default everywhere else).
 */
export default async function FindTalentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { org } = await requireOrganisationMembership();
  const { id } = await params;
  const { q } = await searchParams;
  const supabase = await createClient();

  const { data: opportunity } = await supabase
    .from("opportunities")
    .select("id, title, skills, shortlisting_mode")
    .eq("id", id)
    .eq("organisation_id", org.id)
    .maybeSingle();
  if (!opportunity) notFound();
  if (opportunity.shortlisting_mode !== "self_service") {
    redirect(`/organisation/opportunities/${id}`);
  }

  const { data: existingApplications } = await supabase
    .from("applications")
    .select("talent_id")
    .eq("opportunity_id", id);
  const alreadyAddedIds = new Set((existingApplications ?? []).map((a) => a.talent_id));

  let query = supabase
    .from("public_talent_profiles")
    .select("id, display_name, headline, category, skills, location, work_mode, verification_tier, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const safeQ = q?.replace(/[,()]/g, " ").trim();
  if (safeQ) query = query.ilike("headline", `%${safeQ}%`);

  const { data: talents } = await query;

  const oppSkills = new Set((opportunity.skills ?? []).map((s) => s.toLowerCase()));
  const ranked = (talents ?? [])
    .filter((t) => !alreadyAddedIds.has(t.id))
    .map((t) => ({ ...t, matches: (t.skills ?? []).filter((s) => oppSkills.has(s.toLowerCase())) }))
    // Ranked by skill overlap, then most recently joined — same fairness
    // rule as staff's own suggested-candidates feature: never by rating
    // or tenure, so new talent surface on equal footing.
    .sort((a, b) => {
      if (b.matches.length !== a.matches.length) return b.matches.length - a.matches.length;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <Link href={`/organisation/opportunities/${id}`} className="text-xs font-semibold text-teal-ink underline">
        &larr; Back to {opportunity.title}
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold text-midnight">Find talent</h1>
      <p className="mt-1 text-sm text-slate">
        Ranked by skill overlap with this opportunity, then most recently joined — not by rating or tenure, so new
        talent surface on equal footing.
      </p>

      <form method="get" className="mt-4">
        <label htmlFor="find-talent-search" className="sr-only">
          Search talent by headline
        </label>
        <input
          id="find-talent-search"
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by headline…"
          className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
      </form>

      {ranked.length === 0 ? (
        <p className="mt-6 text-sm text-slate">No matching talent found.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {ranked.map((t) => (
            <li key={t.id} className="rounded-xl border border-slate/15 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Link
                    href={`/passport/${t.id}`}
                    className="font-semibold text-midnight underline decoration-slate/30 hover:decoration-teal"
                  >
                    {t.display_name ?? "AdorWorks talent"}
                  </Link>
                  <p className="text-xs text-slate">{t.headline}</p>
                </div>
                <AddToShortlistButton opportunityId={id} talentId={t.id} />
              </div>
              <p className="mt-2 text-xs text-slate">
                {t.matches.length > 0
                  ? `Matches: ${t.matches.join(", ")}`
                  : "No listed skills overlap — shown for category fit"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
