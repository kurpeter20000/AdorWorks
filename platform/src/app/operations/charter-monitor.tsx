import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { canOpenStaffPath } from "@/lib/domain/staffAccess";
import type { UserRole } from "@/lib/database.types";
import { formatDate } from "@/lib/domain/format";

/**
 * Charter monitor (competitive brief, 0118's charter_monitor()): the three
 * Talent Charter promises most at risk, so staff can act before one is
 * broken — an answer within 14 days, pay on every listing, and payment
 * sent soon after it's received.
 */
const GROUPS = [
  {
    kind: "unanswered_application",
    title: "Applications near the 14-day answer promise",
    empty: "Every application has had an answer within 10 days.",
    href: "/operations/opportunities",
    action: "Nudge the employer or decide",
  },
  {
    kind: "listing_without_pay",
    title: "Open listings without pay",
    empty: "Every open listing shows its pay.",
    href: "/operations/opportunities",
    action: "Ask the employer to add pay, or pause it",
  },
  {
    kind: "payout_overdue",
    title: "Payments not sent to talent within 48 hours",
    empty: "Every payment due has been sent to the talent.",
    href: "/operations/payouts",
    action: "Send the payout",
  },
] as const;

export async function CharterMonitor({ role }: { role: UserRole }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("charter_monitor");
  if (error) {
    console.error("[operations] charter_monitor failed:", error.message);
    return (
      <section className="mt-6 rounded-xl border border-slate/15 bg-white p-5">
        <h2 className="text-lg font-bold text-midnight">Charter monitor</h2>
        <p className="mt-1 text-sm text-coral-ink">Couldn&rsquo;t load the Charter checks. Check that migration 0118 has been applied.</p>
      </section>
    );
  }
  const rows = data ?? [];
  const atRisk = rows.length;

  return (
    <section className="mt-6 rounded-xl border border-slate/15 bg-white p-5" aria-labelledby="charter-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="charter-h" className="text-lg font-bold text-midnight">
          Charter monitor
        </h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${atRisk ? "bg-coral/12 text-coral-ink" : "bg-teal/10 text-teal-ink"}`}>
          {atRisk ? `${atRisk} at risk` : "All promises kept"}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate">
        Talent Charter promises: free to apply, pay on every listing, an answer within 14 days, paid on approval with a receipt.
      </p>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {GROUPS.map((g) => {
          const items = rows.filter((r) => r.kind === g.kind);
          const canOpen = canOpenStaffPath(role, g.href);
          return (
            <div key={g.kind} className={`rounded-lg border p-3 ${items.length ? "border-coral/30 bg-coral/5" : "border-slate/15 bg-cloud/40"}`}>
              <p className="text-sm font-bold text-midnight">
                {g.title} <span className={items.length ? "text-coral-ink" : "text-slate"}>({items.length})</span>
              </p>
              {items.length === 0 ? (
                <p className="mt-1 text-xs text-slate">{g.empty}</p>
              ) : (
                <>
                  <ul className="mt-2 space-y-1.5">
                    {items.slice(0, 5).map((r) => (
                      <li key={r.ref_id} className="text-xs">
                        <span className="block truncate font-semibold text-midnight">{r.title}</span>
                        <span className="text-slate">
                          {r.detail} · since {formatDate(r.since)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {items.length > 5 && <p className="mt-1 text-xs text-slate">and {items.length - 5} more</p>}
                  {canOpen && (
                    <Link href={g.href} className="mt-2 inline-block text-xs font-bold text-teal-ink underline">
                      {g.action} →
                    </Link>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
