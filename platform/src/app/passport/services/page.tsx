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

  // S09-10: no staff-curated price list exists for talent-priced services
  // (service_packages only has scope guidance, no numbers) — the honest,
  // data-driven alternative is a live typical range computed from other
  // published services in the same category, rather than fabricating
  // numbers nobody approved.
  const { data: peerPricing } = await supabase
    .from("talent_services")
    .select("category, price")
    .eq("status", "published")
    .not("price", "is", null);
  const pricingGuidance: Record<string, { min: number; max: number; count: number }> = {};
  for (const row of peerPricing ?? []) {
    if (!row.category || row.price == null) continue;
    const bucket = pricingGuidance[row.category] ?? { min: row.price, max: row.price, count: 0 };
    bucket.min = Math.min(bucket.min, row.price);
    bucket.max = Math.max(bucket.max, row.price);
    bucket.count += 1;
    pricingGuidance[row.category] = bucket;
  }

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

      <ServicesList services={services ?? []} pricingGuidance={pricingGuidance} />
    </main>
  );
}
