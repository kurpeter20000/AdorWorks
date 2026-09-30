import type { Metadata } from "next";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireRole, STAFF_ROLES } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { StatePanel } from "@/components/state-panel";

export const metadata: Metadata = { title: "Operations" };
export const dynamic = "force-dynamic";

type Tile = { label: string; href: string; table: string; column: string; value: string | string[] };
type IntakeRow = { id: string; form_type: string; status: string; created_at: string; payload: Record<string, string | undefined> | null };

// Same nine live counts the old /staff dashboard showed, each linking to
// the section that works that queue. Every number is a real count scoped
// by staff RLS — nothing invented, and a failed count says so.
const GROUPS: { title: string; tiles: Tile[] }[] = [
  {
    title: "Trust queue",
    tiles: [
      { label: "Organisations pending verification", href: "/operations/organisations", table: "organisations", column: "verification_status", value: "pending" },
      { label: "Opportunities pending review", href: "/operations/opportunities", table: "opportunities", column: "status", value: "pending_review" },
      { label: "Services pending review", href: "/operations/services", table: "talent_services", column: "status", value: "pending_review" },
      { label: "Introduction videos pending review", href: "/operations/talent", table: "talent_introduction_videos", column: "status", value: "pending" },
      { label: "Open reports", href: "/operations/reports", table: "reports", column: "status", value: "open" },
    ],
  },
  {
    title: "Workload",
    tiles: [
      { label: "New intake submissions", href: "/operations/intake", table: "intake_submissions", column: "status", value: "new" },
      { label: "Engagements in flight", href: "/operations/engagements", table: "engagements", column: "status", value: ["proposed", "contracted", "active"] },
      { label: "Open disputes", href: "/operations/contracts?status=disputed", table: "disputes", column: "status", value: ["open", "investigating"] },
    ],
  },
  {
    title: "Marketplace health",
    tiles: [
      { label: "Open opportunities", href: "/operations/opportunities?status=open", table: "opportunities", column: "status", value: "open" },
      { label: "Published services", href: "/operations/services?status=published", table: "talent_services", column: "status", value: "published" },
    ],
  },
];

export default async function OperationsPage() {
  await requireRole(...STAFF_ROLES);
  const supabase = await createClient();

  // Some of these tables (intake_submissions, reports, disputes, …) aren't
  // in the hand-maintained database.types.ts, and the table names are data
  // here anyway, so these reads use the untyped client. RLS still applies:
  // it's the same signed-in staff session either way.
  const db = supabase as unknown as SupabaseClient;

  const count = async (t: Tile) => {
    let q = db.from(t.table).select("*", { count: "exact", head: true });
    q = Array.isArray(t.value) ? q.in(t.column, t.value) : q.eq(t.column, t.value);
    const { count: n, error } = await q;
    if (error) console.error(`[operations] count "${t.label}" failed:`, error);
    return error ? null : (n ?? 0);
  };

  const [counts, recent] = await Promise.all([
    Promise.all(GROUPS.map((g) => Promise.all(g.tiles.map(count)))),
    db
      .from("intake_submissions")
      .select("id, form_type, status, created_at, payload")
      .order("created_at", { ascending: false })
      .limit(8)
      .returns<IntakeRow[]>(),
  ]);
  const failed = GROUPS.flatMap((g, gi) => g.tiles.filter((_, ti) => counts[gi][ti] === null).map((t) => t.label));

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-midnight">Operations</h1>
      <p className="mt-1 text-sm text-slate">Everything staff work on, in one place. Every number is a live count.</p>

      {failed.length > 0 && (
        <div className="mt-6">
          <StatePanel title="Some counts couldn&rsquo;t load" tone="danger" role="alert">
            Could not load: {failed.join(", ")}. Refresh the page to try again.
          </StatePanel>
        </div>
      )}

      {GROUPS.map((group, gi) => (
        <section key={group.title} className="mt-6">
          <h2 className="mb-2 text-sm font-bold tracking-wide text-slate uppercase">{group.title}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {group.tiles.map((tile, ti) => {
              const n = counts[gi][ti];
              return (
                <Link
                  key={tile.label}
                  href={tile.href}
                  className="rounded-xl border border-slate/15 bg-white p-4 transition-colors hover:border-teal/40"
                >
                  <span className={`block text-2xl font-extrabold ${n === null ? "text-coral-ink" : "text-midnight"}`}>{n === null ? "!" : n}</span>
                  <span className="mt-0.5 block text-xs font-semibold text-slate">{tile.label}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <section className="mt-8">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-bold tracking-wide text-slate uppercase">Recent submissions</h2>
          <Link href="/operations/intake?status=" className="text-sm font-semibold text-teal-ink underline">
            See all
          </Link>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate/15 bg-white">
          {recent.error ? (
            <p className="p-4 text-sm text-slate">Could not load recent submissions — refresh to try again.</p>
          ) : !recent.data?.length ? (
            <p className="p-4 text-sm text-slate">No submissions yet.</p>
          ) : (
            <ul className="divide-y divide-slate/10">
              {recent.data.map((row) => {
                const p = row.payload ?? {};
                return (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <span>
                      <span className="font-semibold text-midnight">{p.name || p.organisation || p.representative_name || "—"}</span>
                      <span className="text-slate"> · {row.form_type.replace(/_/g, " ")}</span>
                    </span>
                    <span className="flex items-center gap-3 text-xs text-slate">
                      <span className="rounded-full bg-cloud px-2 py-0.5 font-semibold capitalize">{row.status.replace(/_/g, " ")}</span>
                      {new Date(row.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
