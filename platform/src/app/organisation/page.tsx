import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your organisation" };

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_review: "Submitted — awaiting review",
  open: "Live",
  filled: "Filled",
  closed: "Closed",
  cancelled: "Cancelled",
};

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-slate/10 text-slate",
  pending_review: "bg-coral/10 text-coral",
  open: "bg-teal/10 text-teal",
  filled: "bg-violet/10 text-violet",
  closed: "bg-slate/10 text-slate",
  cancelled: "bg-slate/10 text-slate",
};

export default async function OrganisationPage({
  searchParams,
}: {
  searchParams: Promise<{ posted?: string }>;
}) {
  const session = await requireRole("individual_client");
  const { posted } = await searchParams;
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organisations")
    .select("*")
    .eq("representative_id", session.userId)
    .maybeSingle();

  if (!org) {
    redirect("/organisation/setup");
  }

  const { data: opportunities } = await supabase
    .from("opportunities")
    .select("id, title, status, type, created_at")
    .eq("organisation_id", org.id)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-midnight">{org.name}</h1>
          <p className="mt-1 text-sm text-slate">
            {org.verification_status === "verified" ? (
              <span className="font-semibold text-teal">Verified organisation</span>
            ) : org.verification_status === "pending" ? (
              "Verification pending — AdorWorks staff review new organisations before opportunities go live."
            ) : (
              "Verification status: " + org.verification_status
            )}
          </p>
        </div>
        <Link
          href="/organisation/opportunities/new"
          className="whitespace-nowrap rounded-lg bg-violet px-4 py-2 text-sm font-bold text-white"
        >
          Post a new opportunity
        </Link>
      </div>

      {posted && (
        <p className="mt-4 rounded-lg bg-teal/10 px-4 py-3 text-sm font-semibold text-teal">
          Submitted for review. AdorWorks staff will publish it once approved.
        </p>
      )}

      <div className="mt-8">
        <h2 className="font-bold text-midnight">Your opportunities</h2>
        {!opportunities || opportunities.length === 0 ? (
          <p className="mt-2 text-sm text-slate">
            Nothing posted yet.{" "}
            <Link href="/organisation/opportunities/new" className="font-semibold text-violet underline">
              Post your first opportunity
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {opportunities.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/organisation/opportunities/${o.id}`}
                  className="flex items-center justify-between rounded-xl border border-slate/15 bg-white p-4 hover:border-violet/40"
                >
                  <div>
                    <p className="font-semibold text-midnight">{o.title}</p>
                    <p className="text-xs text-slate">{o.type.replace("_", " ")}</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[o.status] ?? "bg-slate/10 text-slate"}`}
                  >
                    {STATUS_LABEL[o.status] ?? o.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
