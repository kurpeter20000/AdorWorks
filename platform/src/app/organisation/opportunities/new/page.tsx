import type { Metadata } from "next";
import Link from "next/link";
import { requireOrganisationMembership } from "@/lib/dal/organisation";
import { createClient } from "@/lib/supabase/server";
import { OpportunityForm } from "./opportunity-form";

export const metadata: Metadata = { title: "Post an opportunity" };

export default async function NewOpportunityPage() {
  const { org } = await requireOrganisationMembership();
  const supabase = await createClient();

  const { data: servicePackages } = await supabase
    .from("service_packages")
    .select("id, category, title, deliverable, inputs_needed, excludes")
    .eq("active", true)
    .order("category", { ascending: true })
    .order("sequence", { ascending: true });

  return (
    <main className="mx-auto max-w-xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">Post an opportunity</h1>
      <p className="mt-2 text-sm text-slate">
        Posting as <span className="font-semibold">{org.name}</span>. AdorWorks only lists paid
        opportunities, and every listing is reviewed by staff before it goes live. Don&rsquo;t know all the
        details yet? Try a{" "}
        <Link href="/organisation/opportunities/brief" className="font-semibold text-teal-ink underline">
          quick project brief
        </Link>{" "}
        instead.
      </p>
      <OpportunityForm organisationId={org.id} servicePackages={servicePackages ?? []} />
    </main>
  );
}
