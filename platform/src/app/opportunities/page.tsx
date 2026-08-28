import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { ReportButton } from "@/components/report-button";
import { ApplyButton } from "./apply-button";
import { SaveButton } from "./save-button";
import { DismissButton } from "./dismiss-button";
import type { Category, EngagementType, WorkMode } from "@/lib/database.types";

export const metadata: Metadata = { title: "Find work" };

const CATEGORY_LABEL: Record<string, string> = {
  creative_media: "Creative & media",
  digital_technology: "Digital & technology",
  business_project_support: "Business & project support",
};

const ENGAGEMENT_LABEL: Record<string, string> = {
  freelance: "Freelance",
  fixed_term_contract: "Fixed-term contract",
  full_time: "Full-time",
  internship: "Internship",
  apprenticeship: "Apprenticeship",
  managed_service: "Managed service",
};

const WORK_MODE_LABEL: Record<string, string> = {
  remote: "Remote",
  on_site: "On-site",
  hybrid: "Hybrid",
  any: "Any",
};

const PAGE_SIZE = 10;
// How many recent, filter-matching rows we pull before ranking/paginating
// in JS — bounded rather than unbounded, but generous enough that
// "Relevant" sort (which re-ranks this whole set by skill overlap) sees
// the real recent pool, not just one page of it. KNOWN LIMITATION: once
// open+public opportunities exceed this cap, anything past the 200 most
// recent can never surface on any page, under either sort — fine at
// current scale, but revisit with real SQL-level pagination (a
// materialized ranking, most likely) before that's a realistic count.
const FETCH_CAP = 200;

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

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    engagementType?: string;
    workMode?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const session = await requireRole("talent");
  const { q, category, engagementType, workMode, sort, page } = await searchParams;
  const supabase = await createClient();
  const sortMode = sort === "relevant" ? "relevant" : "recent";
  const currentPage = Math.max(1, Number(page) || 1);

  let query = supabase
    .from("opportunities")
    .select(
      "id, title, brief, category, skills, location, work_mode, engagement_type, payment_basis, compensation_amount, compensation_min, compensation_max, currency, organisation_id, created_at"
    )
    .eq("status", "open")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(FETCH_CAP);

  // PostgREST's .or() string is a small filter DSL where , ( ) are
  // syntactically meaningful — strip them so a search term can't inject
  // extra filter clauses.
  const safeQ = q?.replace(/[,()]/g, " ").trim();
  if (safeQ) query = query.or(`title.ilike.%${safeQ}%,brief.ilike.%${safeQ}%`);
  if (category && category in CATEGORY_LABEL) query = query.eq("category", category as Category);
  if (engagementType && engagementType in ENGAGEMENT_LABEL) query = query.eq("engagement_type", engagementType as EngagementType);
  if (workMode && workMode in WORK_MODE_LABEL) query = query.eq("work_mode", workMode as WorkMode);

  const [{ data: opportunities }, { data: orgs }, { data: myApplications }, { data: saved }, { data: dismissed }, { data: myProfile }] =
    await Promise.all([
      query,
      supabase.from("organisations").select("id, name"),
      supabase.from("applications").select("opportunity_id").eq("talent_id", session.userId),
      supabase.from("saved_opportunities").select("opportunity_id").eq("talent_id", session.userId),
      supabase.from("dismissed_opportunities").select("opportunity_id").eq("talent_id", session.userId),
      supabase.from("talent_profiles").select("skills").eq("id", session.userId).maybeSingle(),
    ]);

  const orgNames = new Map((orgs ?? []).map((o) => [o.id, o.name]));
  const appliedIds = new Set((myApplications ?? []).map((a) => a.opportunity_id));
  const savedIds = new Set((saved ?? []).map((s) => s.opportunity_id));
  const dismissedIds = new Set((dismissed ?? []).map((d) => d.opportunity_id));
  const hasFilters = !!(q || category || engagementType || workMode);

  const visible = (opportunities ?? []).filter((o) => !dismissedIds.has(o.id));

  // "Relevant" — same fairness rule as the staff console's suggested-
  // candidates feature (staff/js/opportunities.js): rank by skill
  // overlap, tie-break by recency, never by anything paid or reputation-
  // based, so a new opportunity/new talent isn't buried.
  let ranked = visible;
  if (sortMode === "relevant") {
    const mySkills = new Set((myProfile?.skills ?? []).map((s) => s.toLowerCase()));
    ranked = [...visible].sort((a, b) => {
      const aMatches = (a.skills ?? []).filter((s) => mySkills.has(s.toLowerCase())).length;
      const bMatches = (b.skills ?? []).filter((s) => mySkills.has(s.toLowerCase())).length;
      if (bMatches !== aMatches) return bMatches - aMatches;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }

  const totalPages = Math.max(1, Math.ceil(ranked.length / PAGE_SIZE));
  const pageItems = ranked.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function pageHref(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = { q, category, engagementType, workMode, sort: sortMode, page: String(currentPage), ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `/opportunities?${qs}` : "/opportunities";
  }

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-midnight">Find work</h1>
        <div className="flex items-center gap-3">
          <Link href="/opportunities/saved" className="text-sm font-semibold text-violet underline">
            Saved
          </Link>
          <Link href="/applications" className="text-sm font-semibold text-teal-ink underline">
            My applications
          </Link>
        </div>
      </div>
      <p className="mt-2 text-sm text-slate">Open, paid opportunities on AdorWorks right now.</p>

      <div className="mt-4 flex gap-2">
        <Link
          href={pageHref({ sort: "recent", page: "1" })}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${sortMode === "recent" ? "bg-midnight text-white" : "border border-slate/25 text-midnight"}`}
        >
          Recent
        </Link>
        <Link
          href={pageHref({ sort: "relevant", page: "1" })}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${sortMode === "relevant" ? "bg-midnight text-white" : "border border-slate/25 text-midnight"}`}
        >
          Relevant to you
        </Link>
      </div>
      {sortMode === "relevant" && (
        <p className="mt-1 text-xs text-slate">
          Ranked by overlap with your Passport skills, then most recently posted — not by employer spend, so every
          opportunity gets fair visibility.
        </p>
      )}

      <form method="get" className="mt-4 space-y-2">
        <input type="hidden" name="sort" value={sortMode} />
        <label htmlFor="opportunities-search" className="sr-only">
          Search opportunities by title or description
        </label>
        <input
          id="opportunities-search"
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by title or description…"
          className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <label htmlFor="opportunities-category" className="sr-only">
              Filter by category
            </label>
            <select
              id="opportunities-category"
              name="category"
              defaultValue={category ?? ""}
              className="w-full rounded-lg border border-slate/25 px-2 py-2 text-xs"
            >
              <option value="">Any category</option>
              {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="opportunities-engagement-type" className="sr-only">
              Filter by engagement type
            </label>
            <select
              id="opportunities-engagement-type"
              name="engagementType"
              defaultValue={engagementType ?? ""}
              className="w-full rounded-lg border border-slate/25 px-2 py-2 text-xs"
            >
              <option value="">Any type</option>
              {Object.entries(ENGAGEMENT_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="opportunities-work-mode" className="sr-only">
              Filter by work mode
            </label>
            <select
              id="opportunities-work-mode"
              name="workMode"
              defaultValue={workMode ?? ""}
              className="w-full rounded-lg border border-slate/25 px-2 py-2 text-xs"
            >
              <option value="">Any work mode</option>
              {Object.entries(WORK_MODE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" className="rounded-lg bg-teal px-4 py-2 text-sm font-bold text-midnight">
            Search
          </button>
          {hasFilters && (
            <Link href={pageHref({ q: undefined, category: undefined, engagementType: undefined, workMode: undefined, page: "1" })} className="text-xs font-semibold text-slate underline">
              Clear filters
            </Link>
          )}
        </div>
      </form>

      {pageItems.length === 0 ? (
        <div className="mt-8 text-sm text-slate">
          {hasFilters ? (
            <>
              <p>No opportunities match these filters.</p>
              <Link href={pageHref({ q: undefined, category: undefined, engagementType: undefined, workMode: undefined, page: "1" })} className="mt-1 inline-block font-semibold text-teal-ink underline">
                Clear filters and see everything open
              </Link>
            </>
          ) : (
            <p>Nothing open yet — check back soon.</p>
          )}
        </div>
      ) : (
        <>
          <ul className="mt-6 space-y-3">
            {pageItems.map((o) => (
              <li key={o.id} className="rounded-xl border border-slate/15 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-bold text-midnight">{o.title}</p>
                    <p className="text-xs text-slate">{orgNames.get(o.organisation_id) ?? "AdorWorks employer"}</p>
                  </div>
                  <span className="whitespace-nowrap text-sm font-semibold text-teal-ink">
                    {formatCompensation(o)}
                  </span>
                </div>
                {o.brief && <p className="mt-2 line-clamp-3 text-sm text-slate">{o.brief}</p>}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(o.skills ?? []).slice(0, 6).map((s) => (
                    <span key={s} className="rounded-full bg-cloud px-2.5 py-1 text-xs text-slate">
                      {s}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-xs text-slate">
                    {[o.location, o.work_mode, o.engagement_type?.replace("_", " ")].filter(Boolean).join(" · ")}
                  </p>
                  <div className="flex items-center gap-3">
                    <SaveButton opportunityId={o.id} initialSaved={savedIds.has(o.id)} />
                    <ApplyButton opportunityId={o.id} alreadyApplied={appliedIds.has(o.id)} />
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <DismissButton opportunityId={o.id} />
                  <ReportButton targetType="opportunity" targetId={o.id} />
                </div>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between text-sm">
              {currentPage > 1 ? (
                <Link href={pageHref({ page: String(currentPage - 1) })} className="font-semibold text-teal-ink underline">
                  &larr; Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-xs text-slate">
                Page {currentPage} of {totalPages}
              </span>
              {currentPage < totalPages ? (
                <Link href={pageHref({ page: String(currentPage + 1) })} className="font-semibold text-teal-ink underline">
                  Next &rarr;
                </Link>
              ) : (
                <span />
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
