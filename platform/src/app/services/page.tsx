import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CATEGORY_LABEL } from "@/lib/domain/taxonomy";
import type { Category } from "@/lib/database.types";

export const metadata: Metadata = { title: "Browse services" };

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
 * security.
 */
export default async function BrowseServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { q, category } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("talent_services")
    .select("id, talent_id, title, category, problem_solved, deliverables, payment_basis, price, currency, turnaround")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  const safeQ = q?.replace(/[,()]/g, " ").trim();
  if (safeQ) query = query.or(`title.ilike.%${safeQ}%,problem_solved.ilike.%${safeQ}%`);
  if (category && category in CATEGORY_LABEL) query = query.eq("category", category as Category);

  const { data: services } = await query;

  const talentIds = [...new Set((services ?? []).map((s) => s.talent_id))];
  const { data: talents } =
    talentIds.length > 0
      ? await supabase.from("public_talent_profiles").select("id, display_name, headline, verification_tier").in("id", talentIds)
      : { data: [] };
  const talentById = new Map((talents ?? []).map((t) => [t.id, t]));

  const hasFilters = !!(q || category);

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">Browse services</h1>
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

      {!services || services.length === 0 ? (
        <p className="mt-8 text-sm text-slate">
          {hasFilters ? "No services match these filters." : "Nothing published yet — check back soon."}
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {services.map((s) => {
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
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
