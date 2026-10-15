import type { Metadata } from "next";
import Link from "next/link";
import { requireOrganisationMembership } from "@/lib/dal/organisation";
import { OrgInfoForm } from "../org-info-form";

export const metadata: Metadata = { title: "Organisation details" };

export default async function OrganisationDetailsPage() {
  const { org } = await requireOrganisationMembership();

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <Link href="/organisation" className="text-sm font-semibold text-violet underline">
        &larr; Back to organisation
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold text-midnight">Organisation details</h1>
      <p className="mt-1 text-sm text-slate">Shown to talent on your opportunities.</p>
      <div className="mt-6 rounded-xl border border-slate/15 bg-white p-5">
        <OrgInfoForm organisationId={org.id} initial={org} />
      </div>
    </main>
  );
}
