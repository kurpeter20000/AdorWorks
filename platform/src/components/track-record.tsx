import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";

/**
 * Public track record (0097 public_track_record): contracts completed and
 * paid through AdorWorks, reviews from the other side, and disputes by
 * outcome — counts only, never the details of any contract or dispute.
 * Disputes are shown honestly, split by how they ended, rather than hidden
 * or reduced to a single warning flag.
 */
export async function TrackRecord({ kind, id, compact = false }: { kind: "talent" | "organisation"; id: string; compact?: boolean }) {
  const supabase = await createClient();
  const t = await getT();
  const { data, error } = await supabase.rpc("public_track_record", { p_kind: kind, p_id: id });
  const r = data?.[0];
  if (error || !r) return null;

  const resolved = r.talent_favour + r.employer_favour + r.mutual_agreement + r.unresolved + r.outcome_not_recorded;
  const disputeParts = [
    r.talent_favour && t("{n} in the talent's favour", { n: r.talent_favour }),
    r.employer_favour && t("{n} in the employer's favour", { n: r.employer_favour }),
    r.mutual_agreement && t("{n} settled by agreement", { n: r.mutual_agreement }),
    r.unresolved && t("{n} closed without resolution", { n: r.unresolved }),
    r.outcome_not_recorded && t("{n} outcome not recorded", { n: r.outcome_not_recorded }),
    r.disputes_open && t("{n} open", { n: r.disputes_open }),
  ].filter(Boolean) as string[];

  const paidLine =
    r.paid_contracts === 0
      ? t("No contracts completed through AdorWorks yet")
      : r.paid_contracts === 1
        ? t("1 contract completed and paid through AdorWorks")
        : t("{n} contracts completed and paid through AdorWorks", { n: r.paid_contracts });
  const ratingLine =
    r.reviews_received > 0 && r.average_rating !== null
      ? r.reviews_received === 1
        ? t("Rated {rating}/5 from 1 review", { rating: Number(r.average_rating).toFixed(1) })
        : t("Rated {rating}/5 from {n} reviews", { rating: Number(r.average_rating).toFixed(1), n: r.reviews_received })
      : null;
  const disputeLine = r.disputes_total === 0 ? t("No disputes") : `${t("Disputes")}: ${disputeParts.join(", ")}`;

  if (compact) {
    return <p className="mt-1 text-xs text-slate">{[paidLine, ratingLine, r.disputes_total ? disputeLine : null].filter(Boolean).join(" · ")}</p>;
  }

  return (
    <div className="mt-6 rounded-xl border border-slate/15 bg-white p-4">
      <h2 className="font-bold text-midnight">{t("Track record on AdorWorks")}</h2>
      <ul className="mt-2 space-y-1 text-sm text-slate">
        <li>{paidLine}</li>
        {ratingLine && <li>{ratingLine}</li>}
        <li>{disputeLine}</li>
      </ul>
      {resolved + r.disputes_open > 0 && (
        <p className="mt-2 text-xs text-slate">{t("Every dispute is reviewed by AdorWorks staff, and its outcome is recorded here.")}</p>
      )}
    </div>
  );
}
