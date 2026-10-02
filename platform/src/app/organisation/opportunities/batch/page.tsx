import type { Metadata } from "next";
import { requireOrganisationMembership } from "@/lib/dal/organisation";
import { BatchOpportunityForm } from "./batch-opportunity-form";

export const metadata: Metadata = { title: "Post several roles — AdorWorks" };

export default async function BatchOpportunityPage() {
  const { org } = await requireOrganisationMembership();

  return (
    <main className="mx-auto max-w-3xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">Post several roles at once</h1>
      <p className="mt-1 text-sm text-slate">
        For hiring several similar roles — e.g. the same position in different locations — share the common settings
        once below, then add each role as its own row. Every row goes through the same staff review as posting one
        alone.
      </p>
      <BatchOpportunityForm organisationId={org.id} />
    </main>
  );
}
