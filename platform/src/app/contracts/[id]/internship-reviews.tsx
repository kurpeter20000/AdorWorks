"use client";

import { useActionState } from "react";
import { submitInternshipReview } from "@/lib/actions/pathwaysSessions";
import { useT } from "@/i18n/client";

export interface InternshipReviewView {
  stage: "mid_point" | "final";
  score_skills: number;
  score_reliability: number;
  score_growth: number;
  strengths: string | null;
  to_improve: string | null;
  created_at: string;
}

const STAGES = [
  { key: "mid_point", label: "Mid-point review" },
  { key: "final", label: "Final review" },
] as const;

const QUESTIONS = [
  { name: "score_skills", label: "Skills for the role" },
  { name: "score_reliability", label: "Reliability and punctuality" },
  { name: "score_growth", label: "Growth during the internship" },
] as const;

/** Internship Bridge (0123): the supervisor's mid-point and final reviews. The intern sees them once written. */
export function InternshipReviews({ contractId, reviews, canWrite }: { contractId: string; reviews: InternshipReviewView[]; canWrite: boolean }) {
  const t = useT();
  return (
    <section className="mt-8 rounded-card border border-line bg-white p-5" aria-labelledby="intern-h">
      <h2 id="intern-h" className="font-bold text-midnight">
        {t("Internship reviews")}
      </h2>
      <p className="mt-1 text-xs text-slate">{t("The supervisor reviews the intern halfway through and at the end. Reviews count towards the intern's AdorWorks record.")}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {STAGES.map((st) => {
          const r = reviews.find((x) => x.stage === st.key);
          return (
            <div key={st.key} className="rounded-lg border border-slate/15 p-4">
              <p className="text-sm font-bold text-midnight">{t(st.label)}</p>
              {r ? (
                <>
                  <dl className="mt-2 space-y-1 text-xs">
                    {QUESTIONS.map((q) => (
                      <div key={q.name} className="flex justify-between">
                        <dt className="text-slate">{t(q.label)}</dt>
                        <dd className="font-bold text-midnight">{r[q.name]}/5</dd>
                      </div>
                    ))}
                  </dl>
                  {r.strengths && <p className="mt-2 text-xs text-midnight"><strong>{t("Strengths")}:</strong> {r.strengths}</p>}
                  {r.to_improve && <p className="mt-1 text-xs text-midnight"><strong>{t("To work on")}:</strong> {r.to_improve}</p>}
                </>
              ) : canWrite ? (
                <ReviewForm contractId={contractId} stage={st.key} />
              ) : (
                <p className="mt-2 text-xs text-slate">{t("Not written yet.")}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ReviewForm({ contractId, stage }: { contractId: string; stage: "mid_point" | "final" }) {
  const t = useT();
  const [state, action, pending] = useActionState(submitInternshipReview.bind(null, contractId), {});
  if ("saved" in state && state.saved) return <p className="mt-2 text-xs font-semibold text-teal-ink">{t("Saved. The intern has been told.")}</p>;
  return (
    <form action={action} className="mt-2 space-y-2">
      <input type="hidden" name="stage" value={stage} />
      {QUESTIONS.map((q) => (
        <label key={q.name} className="flex items-center justify-between gap-2 text-xs text-midnight">
          {t(q.label)}
          <select name={q.name} required defaultValue="" className="rounded border border-slate/25 px-2 py-1">
            <option value="" disabled>
              1–5
            </option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      ))}
      <textarea name="strengths" rows={2} maxLength={2000} placeholder={t("Strengths")} className="w-full rounded border border-slate/25 px-2 py-1 text-xs" />
      <textarea name="to_improve" rows={2} maxLength={2000} placeholder={t("To work on")} className="w-full rounded border border-slate/25 px-2 py-1 text-xs" />
      {state.message && <p className="text-xs text-coral-ink">{t(state.message)}</p>}
      <button type="submit" disabled={pending} className="min-h-10 rounded bg-teal px-3 text-xs font-bold text-midnight disabled:opacity-60">
        {pending ? t("Saving…") : t("Save review")}
      </button>
    </form>
  );
}
