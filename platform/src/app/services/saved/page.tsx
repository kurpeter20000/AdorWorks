import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { CATEGORY_LABEL } from "@/lib/domain/taxonomy";
import { SaveServiceButton } from "../save-button";

export const metadata: Metadata = { title: "Saved services" };

function formatPrice(s: { payment_basis: string | null; price: number | null; currency: string | null }) {
  if (!s.price) return s.payment_basis === "negotiable" ? "Negotiable" : "Price on request";
  const currency = s.currency || "SSP";
  const basisSuffix: Record<string, string> = { hourly: "/hr", daily: "/day", monthly: "/mo" };
  return `${currency} ${s.price.toLocaleString()}${s.payment_basis ? basisSuffix[s.payment_basis] || "" : ""}`;
}

export default async function SavedServicesPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: saved } = await supabase
    .from("saved_services")
    .select("service_id")
    .eq("saver_id", session.userId)
    .order("created_at", { ascending: false });

  const serviceIds = (saved ?? []).map((s) => s.service_id);

  const { data: services } =
    serviceIds.length > 0
      ? await supabase
          .from("talent_services")
          .select("id, talent_id, title, category, problem_solved, payment_basis, price, currency, turnaround")
          .in("id", serviceIds)
      : { data: [] };

  const byId = new Map((services ?? []).map((s) => [s.id, s]));
  const ordered = serviceIds.map((id) => byId.get(id)).filter((s): s is NonNullable<typeof s> => !!s);

  const talentIds = [...new Set(ordered.map((s) => s.talent_id))];
  const { data: talents } =
    talentIds.length > 0
      ? await supabase.from("public_talent_profiles").select("id, display_name, headline").in("id", talentIds)
      : { data: [] };
  const talentById = new Map((talents ?? []).map((t) => [t.id, t]));

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-midnight">Saved services</h1>
        <Link href="/services" className="text-sm font-semibold text-teal-ink underline">
          Browse services
        </Link>
      </div>

      {ordered.length === 0 ? (
        <p className="mt-8 text-sm text-slate">
          Nothing saved yet.{" "}
          <Link href="/services" className="font-semibold text-teal-ink underline">
            Browse services
          </Link>{" "}
          and save the ones you want to come back to.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {ordered.map((s) => {
            const talent = talentById.get(s.talent_id);
            return (
              <li key={s.id} className="rounded-xl border border-slate/15 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-bold text-midnight">{s.title}</p>
                    {talent && (
                      <Link href={`/passport/${talent.id}`} className="text-xs text-slate underline decoration-slate/30 hover:decoration-teal">
                        {talent.display_name ?? talent.headline ?? "AdorWorks talent"}
                      </Link>
                    )}
                  </div>
                  <span className="whitespace-nowrap text-sm font-semibold text-teal-ink">{formatPrice(s)}</span>
                </div>
                {s.problem_solved && <p className="mt-2 line-clamp-3 text-sm text-slate">{s.problem_solved}</p>}
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-xs text-slate">{s.category ? CATEGORY_LABEL[s.category] : null}</p>
                  <SaveServiceButton serviceId={s.id} initialSaved={true} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
