import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { ServicesList } from "./services-list";

export const metadata: Metadata = { title: "Your services" };

/**
 * Full Service Studio lifecycle (0037 draft foundation + 0042 lifecycle):
 * create/edit/delete drafts, submit for staff review, and once published,
 * self-service pause/resume/withdraw/revise (see lib/actions/services.ts).
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
        Describe a defined service you can deliver — deliverables, price, and turnaround. Submit it for staff
        review when it&rsquo;s ready; once published, employers can find it on Browse Services.
      </p>

      <ServicesList services={services ?? []} />
    </main>
  );
}
