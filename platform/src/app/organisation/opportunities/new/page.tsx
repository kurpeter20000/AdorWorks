import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { OpportunityForm } from "./opportunity-form";

export const metadata: Metadata = { title: "Post an opportunity" };

export default async function NewOpportunityPage() {
  const session = await requireRole("individual_client");
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organisations")
    .select("id, name")
    .eq("representative_id", session.userId)
    .maybeSingle();

  if (!org) {
    redirect("/organisation/setup");
  }

  return (
    <main className="mx-auto max-w-xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">Post an opportunity</h1>
      <p className="mt-2 text-sm text-slate">
        Posting as <span className="font-semibold">{org.name}</span>. AdorWorks only lists paid
        opportunities, and every listing is reviewed by staff before it goes live.
      </p>
      <OpportunityForm organisationId={org.id} />
    </main>
  );
}
