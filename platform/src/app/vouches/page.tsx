import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { VouchRespondButtons } from "./vouch-respond-buttons";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Vouches") };
}

/**
 * 0107 — requests addressed to the signed-in account (any role: a
 * vouch can come from a talent, an employer rep, or anyone else on the
 * platform the requester personally knows). The talent's OWN sent
 * requests live on /passport instead, next to the request form, since
 * that's where they're managing their own trust signals.
 */
export default async function VouchesPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const t = await getT();

  const { data: vouches } = await supabase
    .from("vouches")
    .select("id, talent_id, relationship, statement, status, created_at, responded_at")
    .eq("voucher_id", session.userId)
    .order("created_at", { ascending: false });

  const talentIds = [...new Set((vouches ?? []).map((v) => v.talent_id))];
  const { data: names } =
    talentIds.length > 0 ? await supabase.from("public_profile_names").select("id, full_name").in("id", talentIds) : { data: [] };
  const nameById = new Map((names ?? []).map((n) => [n.id, n.full_name]));

  const pending = (vouches ?? []).filter((v) => v.status === "pending");
  const responded = (vouches ?? []).filter((v) => v.status !== "pending");

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">{t("Vouches")}</h1>
      <p className="mt-2 text-sm text-slate">
        {t("People who've asked you to vouch for them — confirming tells employers you personally know and trust their work.")}
      </p>

      {pending.length === 0 ? (
        <p className="mt-8 text-sm text-slate">{t("No pending vouch requests right now.")}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {pending.map((v) => (
            <li key={v.id} className="rounded-xl border border-slate/15 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-bold text-midnight">{nameById.get(v.talent_id) ?? t("An AdorWorks member")}</p>
                  <p className="text-xs text-slate">{t("Says you're their")}: {v.relationship}</p>
                </div>
                <VouchRespondButtons vouchId={v.id} />
              </div>
              {v.statement && <p className="mt-2 text-sm text-slate">&ldquo;{v.statement}&rdquo;</p>}
            </li>
          ))}
        </ul>
      )}

      {responded.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-bold text-midnight">{t("Past requests")}</h2>
          <ul className="mt-3 space-y-2">
            {responded.map((v) => (
              <li key={v.id} className="flex items-center justify-between rounded-lg border border-slate/15 bg-white p-3 text-sm">
                <span className="text-midnight">{nameById.get(v.talent_id) ?? t("An AdorWorks member")}</span>
                <span className="text-xs text-slate">{v.status === "confirmed" ? t("Confirmed") : t("Declined")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-8 text-xs text-slate">
        <Link href="/dashboard" className="font-semibold text-teal-ink underline">
          {t("Back to dashboard")}
        </Link>
      </p>
    </main>
  );
}
