import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { StatusBadge } from "@/components/status-badge";
import { requireOrganisationMembership } from "@/lib/dal/organisation";
import { OPPORTUNITY_STATES, VERIFICATION_CHECK_STATES } from "@/lib/domain/states";
import { createClient } from "@/lib/supabase/server";
import { EvidenceUpload } from "./evidence-upload";
import { LogoUpload } from "./logo-upload";
import { OrgInfoForm } from "./org-info-form";
import { VerificationCheckResponseForm } from "./verification-check-response-form";

const CHECK_LABEL: Record<string, string> = {
  registration: "Registration",
  representative: "Representative",
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

  const { data: verificationChecks } = await supabase
    .from("verification_checks")
    .select("*")
    .eq("organisation_id", org.id);

  const logoUrl = org.logo_path ? supabase.storage.from("org-logos").getPublicUrl(org.logo_path).data.publicUrl : null;

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4">
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
        <div className="flex flex-col items-end gap-2">
          <Link
            href="/organisation/opportunities/new"
            className="whitespace-nowrap rounded-lg bg-violet px-4 py-2 text-sm font-bold text-white"
          >
            Post a new opportunity
          </Link>
          <Link href="/organisation/team" className="text-xs font-semibold text-violet underline">
            Manage team
          </Link>
        </div>
      </div>

      {org.representative_id === session.userId && (
        <div className="mt-6 rounded-xl border border-slate/15 bg-white p-5">
          <h2 className="font-bold text-midnight">Organisation details</h2>
          <p className="mt-1 text-sm text-slate">Shown to talent on your opportunities.</p>
          <OrgInfoForm organisationId={org.id} initial={org} />
        </div>
      )}

      {org.representative_id === session.userId && (
        <div className="mt-6 rounded-xl border border-slate/15 bg-white p-5">
          <h2 className="font-bold text-midnight">Logo</h2>
          <p className="mt-1 text-sm text-slate">Shown to talent on your opportunities.</p>
          <div className="mt-3">
            <LogoUpload orgId={org.id} existingUrl={logoUrl} />
          </div>
        </div>
      )}

      {verificationChecks && verificationChecks.length > 0 && org.representative_id === session.userId && (
        <div className="mt-6 rounded-xl border border-slate/15 bg-white p-5">
          <h2 className="font-bold text-midnight">Verification</h2>
          <p className="mt-1 text-xs text-slate">
            AdorWorks tracks two things separately: your registration, and confirming you represent this
            organisation.
          </p>
          <div className="mt-3 space-y-4">
            {verificationChecks.map((check) => (
              <div key={check.id} className="rounded-lg border border-slate/15 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-midnight">{CHECK_LABEL[check.check_type] ?? check.check_type}</p>
                  <StatusBadge state={VERIFICATION_CHECK_STATES[check.status]} />
                </div>
                {check.reason && <p className="mt-1 text-xs text-slate">{check.reason}</p>}
                {(check.status === "information_required" || check.status === "rejected") && (
                  <VerificationCheckResponseForm
                    organisationId={org.id}
                    checkId={check.id}
                    isAppeal={check.status === "rejected"}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {posted && (
        <p className="mt-4 rounded-lg bg-teal/10 px-4 py-3 text-sm font-semibold text-teal-ink">
          Submitted for review. AdorWorks staff will publish it once approved.
        </p>
      )}

      {org.verification_status !== "verified" && org.representative_id === session.userId && (
        <div className="mt-6 rounded-xl border border-coral/30 bg-coral/5 p-5">
          <h2 className="font-bold text-midnight">Verification evidence</h2>
          <p className="mt-1 text-sm text-slate">
            Upload a registration document (certificate, license, or similar) so AdorWorks staff
            can verify your organisation.
          </p>
          <EvidenceUpload orgId={org.id} existingPath={org.registration_evidence_path} />
        </div>
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
                  <StatusBadge state={OPPORTUNITY_STATES[o.status]} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
