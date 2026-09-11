import type { Metadata } from "next";
import Link from "next/link";
import { requireRole, STAFF_ROLES } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { StatePanel } from "@/components/state-panel";

export const metadata: Metadata = { title: "Operations" };

export default async function OperationsPage() {
  await requireRole(...STAFF_ROLES);
  const supabase = await createClient();

  // Every count below is a live query scoped to a real, staff-visible
  // status — no invented numbers. Only "Opportunities awaiting review"
  // links anywhere yet; the others surface a genuine backlog size while
  // their own review screens are still being built (see PLATFORM-AUDIT.md
  // for the staged follow-up plan), rather than pretending it's zero.
  const [
    { count: pendingOpportunities, error: oppError },
    { count: pendingServices, error: svcError },
    { count: pendingOrgs, error: orgError },
  ] = await Promise.all([
    supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
    supabase.from("talent_services").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
    supabase.from("organisations").select("id", { count: "exact", head: true }).eq("verification_status", "pending"),
  ]);
  const dataError = Boolean(oppError || svcError || orgError);

  return (
    <main className="mx-auto max-w-5xl p-6 sm:p-8 lg:p-10">
      <h1 className="text-2xl font-extrabold text-midnight">Operations</h1>
      <p className="mt-1 text-sm text-slate">
        Review queues for AdorWorks staff. Every number below is a live count from the real database.
      </p>

      {dataError && (
        <div className="mt-6">
          <StatePanel title="Couldn&rsquo;t load every queue" tone="danger" role="alert">
            Some counts below may be incomplete — refresh the page to try again.
          </StatePanel>
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Link
          href="/operations/opportunities"
          className="rounded-xl border border-slate/15 bg-white p-4 transition-colors hover:border-teal/40"
        >
          <span className="block text-2xl font-extrabold text-midnight">{pendingOpportunities ?? 0}</span>
          <span className="mt-0.5 block text-xs font-semibold text-slate">Opportunities awaiting review</span>
        </Link>

        <div className="rounded-xl border border-slate/15 bg-white p-4 opacity-70">
          <span className="block text-2xl font-extrabold text-midnight">{pendingServices ?? 0}</span>
          <span className="mt-0.5 block text-xs font-semibold text-slate">Services awaiting review</span>
          <span className="mt-1 block text-[11px] font-semibold text-slate/60">Review screen not built yet</span>
        </div>

        <div className="rounded-xl border border-slate/15 bg-white p-4 opacity-70">
          <span className="block text-2xl font-extrabold text-midnight">{pendingOrgs ?? 0}</span>
          <span className="mt-0.5 block text-xs font-semibold text-slate">Organisations awaiting verification</span>
          <span className="mt-1 block text-[11px] font-semibold text-slate/60">Review screen not built yet</span>
        </div>
      </div>

      <p className="mt-8 text-xs text-slate">
        <Link href="/contracts" className="font-semibold text-teal-ink underline">
          Contracts
        </Link>{" "}
        are browsable above. Disputes and finance oversight still live in the existing staff console during this
        staged rollout.
      </p>
    </main>
  );
}
