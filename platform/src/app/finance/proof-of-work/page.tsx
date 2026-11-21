import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney } from "@/lib/domain/format";
import { getT } from "@/i18n/server";
import { msg } from "@/i18n/config";
import { PrintButton } from "./print-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Proof of work") };
}

const TIER_LABEL: Record<string, string> = {
  registered: msg("Registered"),
  identity_verified: msg("Identity verified"),
  adorverified: msg("AdorVerified"),
  adorcertified: msg("AdorCertified"),
  team_lead: msg("Team lead"),
};

/**
 * Proof of work (talent Earnings card, competitive brief): a printable
 * record of the talent's AdorWorks contracts and payments, with receipt
 * numbers and a link anyone can use to check it. Save as PDF from the
 * browser's print dialog.
 */
export default async function ProofOfWorkPage() {
  const session = await requireRole("talent");
  const t = await getT();
  const supabase = await createClient();

  const [{ data: profile }, { data: contracts }, { data: payments }] = await Promise.all([
    supabase.from("talent_profiles").select("display_name, headline, verification_tier").eq("id", session.userId).maybeSingle(),
    supabase
      .from("contracts")
      .select("id, organisation_id, opportunity_id, status, started_at, completed_at")
      .eq("talent_id", session.userId)
      .in("status", ["active", "completed"])
      .order("started_at", { ascending: false }),
    supabase
      .from("payment_events")
      .select("contract_id, net_amount, currency, receipt_number, created_at")
      .eq("status", "succeeded")
      .order("created_at", { ascending: true }),
  ]);

  const orgIds = [...new Set((contracts ?? []).map((c) => c.organisation_id))];
  const oppIds = [...new Set((contracts ?? []).map((c) => c.opportunity_id).filter((id): id is string => !!id))];
  const [{ data: orgs }, { data: opps }] = await Promise.all([
    orgIds.length ? supabase.from("public_organisation_names").select("id, name").in("id", orgIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    oppIds.length ? supabase.from("opportunities").select("id, title").in("id", oppIds) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);
  const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]));
  const oppTitle = new Map((opps ?? []).map((o) => [o.id, o.title]));
  const paymentsByContract = new Map<string, NonNullable<typeof payments>>();
  for (const p of payments ?? []) {
    const list = paymentsByContract.get(p.contract_id) ?? [];
    list.push(p);
    paymentsByContract.set(p.contract_id, list);
  }
  const name = profile?.display_name || session.fullName || t("AdorWorks talent");
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  return (
    <main className="mx-auto max-w-3xl p-6 sm:p-8 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/finance" className="text-sm font-bold text-teal-ink underline">
          {t("Back to Finance")}
        </Link>
        <PrintButton />
      </div>

      <article className="mt-6 rounded-card border border-line bg-white p-6 print:border-none print:p-0">
        <p className="text-xs font-extrabold tracking-wider text-slate uppercase">{t("AdorWorks proof of work")}</p>
        <h1 className="mt-1 text-2xl font-extrabold text-midnight">
          <span className="no-i18n">{name}</span>
        </h1>
        {profile?.headline && <p className="text-sm text-slate">{profile.headline}</p>}
        <p className="mt-2 text-sm text-midnight">
          {t("Trust tier: {tier}", { tier: t(TIER_LABEL[profile?.verification_tier ?? "registered"] ?? "Registered") })} ·{" "}
          {t("Prepared {date}", { date: formatDate(new Date(), { day: "numeric", month: "long", year: "numeric" }) })}
        </p>
        <p className="mt-1 text-xs text-slate">
          {t("Check this record at {url}", { url: `${site}/verify/${session.userId}` })}
        </p>

        <h2 className="mt-6 text-lg font-extrabold text-midnight">{t("Contracts")}</h2>
        {(contracts ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-slate">{t("No contracts yet.")}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {(contracts ?? []).map((c) => {
              const paid = paymentsByContract.get(c.id) ?? [];
              return (
                <li key={c.id} className="break-inside-avoid rounded-lg border border-line p-4">
                  <p className="font-bold text-midnight">
                    <span className="no-i18n">{(c.opportunity_id && oppTitle.get(c.opportunity_id)) || t("Service engagement")}</span>
                  </p>
                  <p className="text-sm text-slate">
                    <span className="no-i18n">{orgName.get(c.organisation_id) ?? t("AdorWorks employer")}</span> · {formatDate(c.started_at)} –{" "}
                    {c.completed_at ? formatDate(c.completed_at) : t("in progress")}
                  </p>
                  {paid.length > 0 && (
                    <table className="mt-2 w-full text-left text-xs">
                      <thead className="text-slate">
                        <tr>
                          <th className="py-1 font-semibold">{t("Date")}</th>
                          <th className="py-1 font-semibold">{t("Receipt number")}</th>
                          <th className="py-1 text-end font-semibold">{t("Net to talent")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paid.map((p) => (
                          <tr key={`${p.receipt_number}-${p.created_at}`} className="border-t border-line">
                            <td className="py-1">{formatDate(p.created_at)}</td>
                            <td className="py-1">{p.receipt_number ?? "—"}</td>
                            <td className="py-1 text-end">{formatMoney(p.net_amount, p.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-6 text-xs text-slate">{t("Contact details are not included. Employers can hire this person through AdorWorks.")}</p>
      </article>
    </main>
  );
}
