import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { ServicesList } from "./services-list";

export const metadata: Metadata = { title: "Your services" };

/**
 * Stage 2 draft-only foundation: create/edit/delete services, no
 * submission or publishing yet (see lib/actions/services.ts and 0037).
 */
export default async function ServicesPage() {
  const session = await requireRole("talent");
  const supabase = await createClient();

  const { data: services } = await supabase
    .from("talent_services")
    .select("*")
    .eq("talent_id", session.userId)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <Link href="/passport" className="text-xs font-semibold text-teal-ink underline">
        &larr; Back to your Passport
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold text-midnight">Your services</h1>
      <p className="mt-1 text-sm text-slate">
        Describe a defined service you can deliver — deliverables, price, and turnaround. This is a draft space
        for now: publishing to the marketplace and staff review are coming in a later stage.
      </p>

      <ServicesList services={services ?? []} />
    </main>
  );
}
