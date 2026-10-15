import type { Metadata } from "next";
import Link from "next/link";
import { requireOrganisationMembership } from "@/lib/dal/organisation";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/status-badge";
import { VERIFICATION_CHECK_STATES } from "@/lib/domain/states";
import { EvidenceUpload } from "../evidence-upload";
import { VerificationCheckResponseForm } from "../verification-check-response-form";

const CHECK_LABEL: Record<string, string> = {
  registration: "Registration",
  representative: "Representative",
};

export const metadata: Metadata = { title: "Verification" };

export default async function OrganisationVerificationPage() {
  const { org, session } = await requireOrganisationMembership();
  const supabase = await createClient();

  const { data: verificationChecks } = await supabase
    .from("verification_checks")
    .select("*")
    .eq("organisation_id", org.id);

  const isRepresentative = org.representative_id === session.userId;

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <Link href="/organisation" className="text-sm font-semibold text-violet underline">
        &larr; Back to organisation
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold text-midnight">Verification</h1>
      <p className="mt-1 text-sm text-slate">
        {org.verification_status === "verified" ? (
          <span className="font-semibold text-teal-ink">Verified organisation</span>
        ) : org.verification_status === "pending" ? (
          "Pending — AdorWorks staff review new organisations before opportunities go live."
        ) : (
          "Verification status: " + org.verification_status
        )}
      </p>

      {org.verification_status !== "verified" && isRepresentative && (
        <div className="mt-6 rounded-xl border border-coral/30 bg-coral/5 p-5">
          <h2 className="font-bold text-midnight">Verification evidence</h2>
          <p className="mt-1 text-sm text-slate">
            Upload a registration document (certificate, license, or similar) so AdorWorks staff can verify your
            organisation.
          </p>
          <EvidenceUpload orgId={org.id} existingPath={org.registration_evidence_path} />
        </div>
      )}

      {verificationChecks && verificationChecks.length > 0 && (
        <div className="mt-6 rounded-xl border border-slate/15 bg-white p-5">
          <p className="text-xs text-slate">
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
                {isRepresentative && (check.status === "information_required" || check.status === "rejected") && (
                  <VerificationCheckResponseForm organisationId={org.id} checkId={check.id} isAppeal={check.status === "rejected"} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
