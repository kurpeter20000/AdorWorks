import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { StatusBadge } from "@/components/status-badge";
import { requireOrganisationMembership } from "@/lib/dal/organisation";
import { OPPORTUNITY_STATES } from "@/lib/domain/states";
import { createClient } from "@/lib/supabase/server";
import { ExportButton } from "./export-button";

const OPPORTUNITY_TYPE_LABEL: Record<string, string> = {
  service: "Service",
  project: "Project",
  contract: "Contract",
  full_time: "Full-time role",
  squad: "Talent squad",
};

export const metadata: Metadata = { title: "Your organisation" };

export default async function OrganisationPage({
  searchParams,
}: {
  searchParams: Promise<{ posted?: string }>;
}) {
  const { session, org } = await requireOrganisationMembership();
  const { posted } = await searchParams;
  const supabase = await createClient();

  const { data: opportunities } = await supabase
    .from("opportunities")
    .select("id, title, status, type, created_at")
    .eq("organisation_id", org.id)
    .order("created_at", { ascending: false });

  const logoUrl = org.logo_path ? supabase.storage.from("org-logos").getPublicUrl(org.logo_path).data.publicUrl : null;

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <div className="flex items-center gap-4">
        {logoUrl && (
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-slate/15 bg-cloud">
            <Image src={logoUrl} alt="" fill sizes="48px" className="object-contain" />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-extrabold text-midnight">{org.name}</h1>
          <p className="mt-1 text-sm text-slate">
            {org.verification_status === "verified" ? (
              <span className="font-semibold text-teal-ink">Verified organisation</span>
            ) : org.verification_status === "pending" ? (
              "Verification pending — AdorWorks staff review new organisations before opportunities go live."
            ) : (
              "Verification status: " + org.verification_status
            )}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Link
          href="/organisation/opportunities/new"
          className="whitespace-nowrap rounded-lg bg-violet px-4 py-2 text-sm font-bold text-white"
        >
          Post an opportunity
        </Link>
        <Link
          href="/organisation/opportunities/batch"
          className="rounded-lg border border-slate/25 px-3 py-1.5 text-xs font-semibold text-midnight"
        >
          Post several at once
        </Link>
        <ExportButton />
      </div>

      {posted && (
        <p className="mt-4 rounded-lg bg-teal/10 px-4 py-3 text-sm font-semibold text-teal-ink">
          Submitted for review. AdorWorks staff will publish it once approved.
        </p>
      )}

      {/* Opportunities come before settings: they're what an employer
          opens this page for day to day. */}
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
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {opportunities.map((o) => (
              <Link
                key={o.id}
                href={`/organisation/opportunities/${o.id}`}
                className="flex items-center justify-between rounded-xl border border-slate/15 bg-white p-4 hover:border-violet/40"
              >
                <div>
                  <p className="font-semibold text-midnight">{o.title}</p>
                  <p className="text-xs text-slate">{OPPORTUNITY_TYPE_LABEL[o.type] ?? o.type}</p>
                </div>
                <StatusBadge state={OPPORTUNITY_STATES[o.status]} />
              </Link>
            ))}
          </div>
        )}
      </div>

      {org.representative_id === session.userId && (
        <div className="mt-10 border-t border-slate/15 pt-6">
          <h2 className="font-bold text-midnight">Organisation settings</h2>
          <p className="mt-1 text-sm text-slate">Click a section to review or make changes.</p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link
              href="/organisation/details"
              className="rounded-xl border border-slate/15 bg-white p-4 transition-colors hover:border-violet/40"
            >
              <p className="font-semibold text-midnight">Organisation details</p>
              <p className="mt-0.5 text-xs text-slate">Name, sector, website, billing email.</p>
            </Link>
            <Link
              href="/organisation/logo"
              className="flex items-center gap-3 rounded-xl border border-slate/15 bg-white p-4 transition-colors hover:border-violet/40"
            >
              {logoUrl && (
                <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md border border-slate/15 bg-cloud">
                  <Image src={logoUrl} alt="" fill sizes="36px" className="object-contain" />
                </div>
              )}
              <div>
                <p className="font-semibold text-midnight">Logo</p>
                <p className="mt-0.5 text-xs text-slate">{logoUrl ? "Shown on your opportunities." : "Not set yet."}</p>
              </div>
            </Link>
            <Link
              href="/organisation/verification"
              className="rounded-xl border border-slate/15 bg-white p-4 transition-colors hover:border-violet/40"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-midnight">Verification</p>
                {org.verification_status === "verified" ? (
                  <span className="whitespace-nowrap rounded-full bg-teal/10 px-2.5 py-0.5 text-xs font-semibold text-teal-ink">Verified</span>
                ) : (
                  <span className="whitespace-nowrap rounded-full bg-cloud px-2.5 py-0.5 text-xs font-semibold text-slate capitalize">
                    {org.verification_status}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate">Registration evidence and representative checks.</p>
            </Link>
            <Link
              href="/organisation/team"
              className="rounded-xl border border-slate/15 bg-white p-4 transition-colors hover:border-violet/40"
            >
              <p className="font-semibold text-midnight">Team</p>
              <p className="mt-0.5 text-xs text-slate">Invite teammates and manage access.</p>
            </Link>
            <Link
              href="/organisation/activity"
              className="rounded-xl border border-slate/15 bg-white p-4 transition-colors hover:border-violet/40"
            >
              <p className="font-semibold text-midnight">Activity</p>
              <p className="mt-0.5 text-xs text-slate">What your team has done recently.</p>
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
