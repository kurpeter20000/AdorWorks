import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { ApplyButton } from "./apply-button";
import { SaveButton } from "./save-button";
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
  searchParams: Promise<{ q?: string; category?: string; engagementType?: string; workMode?: string }>;
}) {
  const session = await requireRole("talent");
  const { q, category, engagementType, workMode } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("opportunities")
    .select(
      "id, title, brief, category, skills, location, work_mode, engagement_type, payment_basis, compensation_amount, compensation_min, compensation_max, currency, organisation_id"
    )
    .eq("status", "open")
    .eq("visibility", "public")
    .order("created_at", { ascending: false });

  // PostgREST's .or() string is a small filter DSL where , ( ) are
  // syntactically meaningful — strip them so a search term can't inject
  // extra filter clauses.
  const safeQ = q?.replace(/[,()]/g, " ").trim();
  if (safeQ) query = query.or(`title.ilike.%${safeQ}%,brief.ilike.%${safeQ}%`);
  if (category && category in CATEGORY_LABEL) query = query.eq("category", category as Category);
  if (engagementType && engagementType in ENGAGEMENT_LABEL) query = query.eq("engagement_type", engagementType as EngagementType);
  if (workMode && workMode in WORK_MODE_LABEL) query = query.eq("work_mode", workMode as WorkMode);

  const [{ data: opportunities }, { data: orgs }, { data: myApplications }, { data: saved }] = await Promise.all([
    query,
    supabase.from("organisations").select("id, name"),
    supabase.from("applications").select("opportunity_id").eq("talent_id", session.userId),
    supabase.from("saved_opportunities").select("opportunity_id").eq("talent_id", session.userId),
  ]);

  const orgNames = new Map((orgs ?? []).map((o) => [o.id, o.name]));
  const appliedIds = new Set((myApplications ?? []).map((a) => a.opportunity_id));
  const savedIds = new Set((saved ?? []).map((s) => s.opportunity_id));
  const hasFilters = !!(q || category || engagementType || workMode);

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-midnight">Find work</h1>
        <div className="flex items-center gap-3">
          <Link href="/opportunities/saved" className="text-sm font-semibold text-violet underline">
            Saved
          </Link>
          <Link href="/applications" className="text-sm font-semibold text-teal underline">
            My applications
          </Link>
        </div>
      </div>
      <p className="mt-2 text-sm text-slate">Open, paid opportunities on AdorWorks right now.</p>

      <form method="get" className="mt-4 space-y-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by title or description…"
          className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-3 gap-2">
          <select name="category" defaultValue={category ?? ""} className="rounded-lg border border-slate/25 px-2 py-2 text-xs">
            <option value="">Any category</option>
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            name="engagementType"
            defaultValue={engagementType ?? ""}
            className="rounded-lg border border-slate/25 px-2 py-2 text-xs"
          >
            <option value="">Any type</option>
            {Object.entries(ENGAGEMENT_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select name="workMode" defaultValue={workMode ?? ""} className="rounded-lg border border-slate/25 px-2 py-2 text-xs">
            <option value="">Any work mode</option>
            {Object.entries(WORK_MODE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" className="rounded-lg bg-teal px-4 py-2 text-sm font-bold text-midnight">
            Search
          </button>
          {hasFilters && (
            <Link href="/opportunities" className="text-xs font-semibold text-slate underline">
              Clear filters
            </Link>
          )}
        </div>
      </form>

      {!opportunities || opportunities.length === 0 ? (
        <p className="mt-8 text-sm text-slate">
          {hasFilters ? "No opportunities match these filters." : "Nothing open yet — check back soon."}
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {opportunities.map((o) => (
            <li key={o.id} className="rounded-xl border border-slate/15 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-bold text-midnight">{o.title}</p>
                  <p className="text-xs text-slate">{orgNames.get(o.organisation_id) ?? "AdorWorks employer"}</p>
                </div>
                <span className="whitespace-nowrap text-sm font-semibold text-teal">
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
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
