import type { Metadata } from "next";
import Link from "next/link";
import { verifySession } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { CATEGORY_LABEL } from "@/lib/domain/taxonomy";
import { ReportButton } from "@/components/report-button";
import { SaveServiceButton } from "./save-button";
import { DismissServiceButton } from "./dismiss-button";
import type { Category } from "@/lib/database.types";

export const metadata: Metadata = { title: "Browse services" };

const PAGE_SIZE = 10;

function formatPrice(s: { payment_basis: string | null; price: number | null; currency: string | null }) {
  if (!s.price) return s.payment_basis === "negotiable" ? "Negotiable" : "Price on request";
  const currency = s.currency || "SSP";
  const basisSuffix: Record<string, string> = { hourly: "/hr", daily: "/day", monthly: "/mo" };
  return `${currency} ${s.price.toLocaleString()}${s.payment_basis ? basisSuffix[s.payment_basis] || "" : ""}`;
}

/**
 * Public discovery page for published Service Studio listings (0042) —
 * no requireRole/requireSession, same as /passport/[id]: talent_services_
 * select's "status = 'published'" clause (0042) already makes these rows
 * world-readable, so gating the page itself would only add friction, not
 * security. Save/dismiss/report still need a real account — verifySession
 * (not requireSession) so a signed-out visitor can still browse; the
 * per-item actions themselves handle "not signed in" (see save-button.tsx).
 */
export default async function BrowseServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; page?: string }>;
}) {
  const session = await verifySession();
  const { q, category, page } = await searchParams;
  const supabase = await createClient();
  const currentPage = Math.max(1, Number(page) || 1);

  const [{ data: saved }, { data: dismissed }] = await Promise.all([
    session ? supabase.from("saved_services").select("service_id").eq("saver_id", session.userId) : Promise.resolve({ data: [] }),
    session
      ? supabase.from("dismissed_services").select("service_id").eq("saver_id", session.userId)
      : Promise.resolve({ data: [] }),
  ]);
  const savedIds = new Set((saved ?? []).map((s) => s.service_id));
  const dismissedIds = [...new Set((dismissed ?? []).map((d) => d.service_id))];

  let query = supabase
    .from("talent_services")
    .select("id, talent_id, title, category, problem_solved, deliverables, payment_basis, price, currency, turnaround", {
      count: "exact",
    })
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);

  const safeQ = q?.replace(/[,()]/g, " ").trim();
  if (safeQ) query = query.or(`title.ilike.%${safeQ}%,problem_solved.ilike.%${safeQ}%`);
  if (category && category in CATEGORY_LABEL) query = query.eq("category", category as Category);
  if (dismissedIds.length > 0) query = query.not("id", "in", `(${dismissedIds.join(",")})`);

  const { data: services, count } = await query;
  const visible = services ?? [];

  const talentIds = [...new Set(visible.map((s) => s.talent_id))];
  const { data: talents } =
    talentIds.length > 0
      ? await supabase.from("public_talent_profiles").select("id, display_name, headline, verification_tier").in("id", talentIds)
      : { data: [] };
  const talentById = new Map((talents ?? []).map((t) => [t.id, t]));

  const hasFilters = !!(q || category);
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  function pageHref(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = { q, category, page: String(currentPage), ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `/services?${qs}` : "/services";
  }

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-midnight">Browse services</h1>
        {session && (
          <Link href="/services/saved" className="text-sm font-semibold text-violet underline">
            Saved
          </Link>
        )}
      </div>
      <p className="mt-2 text-sm text-slate">Defined, ready-to-book services from AdorWorks talent.</p>

      <form method="get" className="mt-4 space-y-2">
        <label htmlFor="services-search" className="sr-only">
          Search services by title or description
        </label>
        <input
          id="services-search"
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by title or description…"
          className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-2">
          <label htmlFor="services-category" className="sr-only">
            Filter by category
          </label>
          <select
            id="services-category"
            name="category"
            defaultValue={category ?? ""}
            className="w-full max-w-xs rounded-lg border border-slate/25 px-2 py-2 text-xs"
          >
            <option value="">Any category</option>
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-lg bg-teal px-4 py-2 text-sm font-bold text-midnight">
            Search
          </button>
          {hasFilters && (
            <Link href="/services" className="text-xs font-semibold text-slate underline">
              Clear
            </Link>
          )}
        </div>
      </form>

      {visible.length === 0 ? (
        <div className="mt-8 text-sm text-slate">
          {hasFilters ? (
            <>
              <p>No services match these filters.</p>
              <Link href="/services" className="mt-1 inline-block font-semibold text-teal-ink underline">
                Clear filters and see everything published
              </Link>
            </>
          ) : (
            <p>Nothing published yet — check back soon.</p>
          )}
        </div>
      ) : (
        <>
          <ul className="mt-6 space-y-3">
            {visible.map((s) => {
              const talent = talentById.get(s.talent_id);
              return (
                <li key={s.id} className="rounded-xl border border-slate/15 bg-white p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-bold text-midnight">{s.title}</p>
                      {talent && (
                        <Link
                          href={`/passport/${talent.id}`}
                          className="text-xs text-slate underline decoration-slate/30 hover:decoration-teal"
                        >
                          {talent.display_name ?? talent.headline ?? "AdorWorks talent"}
                        </Link>
                      )}
                    </div>
                    <span className="whitespace-nowrap text-sm font-semibold text-teal-ink">{formatPrice(s)}</span>
                  </div>
                  {s.problem_solved && <p className="mt-2 line-clamp-3 text-sm text-slate">{s.problem_solved}</p>}
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-xs text-slate">
                      {[s.category ? CATEGORY_LABEL[s.category] : null, s.turnaround].filter(Boolean).join(" · ")}
                    </p>
                    {talent && (
                      <Link href={`/passport/${talent.id}`} className="text-xs font-semibold text-teal-ink underline">
                        View talent
                      </Link>
                    )}
                  </div>
                  {session && (
                    <div className="mt-3 flex items-center justify-between border-t border-slate/10 pt-3">
                      <div className="flex items-center gap-3">
                        <SaveServiceButton serviceId={s.id} initialSaved={savedIds.has(s.id)} />
                        <DismissServiceButton serviceId={s.id} />
                      </div>
                      <ReportButton targetType="talent_service" targetId={s.id} />
                    </div>
                  )}
                </li>
              );
            })}
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
