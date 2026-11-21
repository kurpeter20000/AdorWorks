"use client";

import { useActionState } from "react";
import { submitReview } from "@/lib/actions/reviews";
import type { FormState } from "@/lib/actions/auth";
import { AGAIN_QUESTION, SCORE_QUESTIONS, type ReviewerRole, type ScoreKey } from "@/lib/domain/reviews";
import { useT } from "@/i18n/client";

const initialState: FormState = {};
const SCORE_KEYS: ScoreKey[] = ["score_quality", "score_communication", "score_timeliness"];

export interface ReviewView {
  rating: number;
  feedback: string | null;
  score_quality?: number | null;
  score_communication?: number | null;
  score_timeliness?: number | null;
  would_work_again?: boolean | null;
}

function Stars({ rating, label }: { rating: number; label: string }) {
  return (
    <span aria-label={label} className="text-teal-ink">
      {"★".repeat(rating)}
      <span className="text-slate/30">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

/** One 1–5 question as five tappable stars (radio buttons underneath). */
function StarQuestion({ name, label }: { name: string; label: string }) {
  const t = useT();
  return (
    <fieldset className="mt-3">
      <legend className="text-sm font-semibold text-midnight">{label}</legend>
      <div className="mt-1 flex flex-row-reverse justify-end gap-1">
        {[5, 4, 3, 2, 1].map((n) => (
          <label key={n} className="peer cursor-pointer text-2xl leading-none text-slate/30 has-[:checked]:text-teal-ink peer-has-[:checked]:text-teal-ink hover:text-teal-ink">
            <input type="radio" name={name} value={n} required className="sr-only" />
            <span aria-hidden="true">★</span>
            <span className="sr-only">{t("{n} out of 5", { n })}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** What one side said about the other: stars, the three scores and "again?". */
function ReviewSummary({ review, byRole, title }: { review: ReviewView; byRole: ReviewerRole; title: string }) {
  const t = useT();
  const questions = SCORE_QUESTIONS[byRole];
  return (
    <div className="rounded-xl border border-slate/15 bg-white p-4">
      <p className="text-xs font-semibold text-slate">{title}</p>
      <div className="mt-1">
        <Stars rating={review.rating} label={t("{n} out of 5", { n: review.rating })} />
      </div>
      {review.score_quality != null && (
        <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-3">
          {SCORE_KEYS.map((k) => (
            <div key={k} className="rounded-lg bg-cloud px-2 py-1">
              <dt className="text-slate">{t(questions[k])}</dt>
              <dd className="font-bold text-midnight">{review[k]}/5</dd>
            </div>
          ))}
        </dl>
      )}
      {review.would_work_again != null && (
        <p className="mt-2 text-xs text-midnight">
          {t(AGAIN_QUESTION[byRole])} <strong>{review.would_work_again ? t("Yes") : t("No")}</strong>
        </p>
      )}
      {review.feedback && <p className="mt-2 text-sm text-slate">{review.feedback}</p>}
    </div>
  );
}

export function ReviewSection({
  contractId,
  reviewerRole,
  myReview,
  theirReview,
  fullyPaid,
}: {
  contractId: string;
  reviewerRole: ReviewerRole;
  myReview: ReviewView | null;
  theirReview: ReviewView | null;
  /** Reviews open only once every milestone is paid (0097 enforces it in the database too). */
  fullyPaid: boolean;
}) {
  const t = useT();
  const boundAction = submitReview.bind(null, contractId, reviewerRole);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const questions = SCORE_QUESTIONS[reviewerRole];
  const otherRole: ReviewerRole = reviewerRole === "talent" ? "employer" : "talent";
  const firstError = Object.values(state.errors ?? {}).flat()[0];

  return (
    <div className="mt-8">
      <h2 className="font-bold text-midnight">{t("Reviews")}</h2>
      <p className="mt-1 text-xs text-slate">{t("Each side reviews independently — you'll see theirs once you've submitted yours.")}</p>

      <div className="mt-3 space-y-3">
        {!myReview && !fullyPaid ? (
          <p className="rounded-xl border border-slate/15 bg-white p-4 text-sm text-slate">
            {t("Reviews open once every milestone has been paid through AdorWorks — so every rating on AdorWorks comes from real, paid work.")}
          </p>
        ) : myReview ? (
          <ReviewSummary review={myReview} byRole={reviewerRole} title={t("Your review")} />
        ) : (
          <form action={formAction} className="rounded-xl border border-slate/15 bg-white p-4">
            <StarQuestion name="rating" label={t("Overall")} />
            {SCORE_KEYS.map((k) => (
              <StarQuestion key={k} name={k} label={t(questions[k])} />
            ))}
            <fieldset className="mt-3">
              <legend className="text-sm font-semibold text-midnight">{t(AGAIN_QUESTION[reviewerRole])}</legend>
              <div className="mt-1 flex gap-2">
                {(["yes", "no"] as const).map((v) => (
                  <label key={v} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate/25 px-4 text-sm has-[:checked]:border-teal has-[:checked]:bg-teal/5">
                    <input type="radio" name="would_work_again" value={v} required />
                    {v === "yes" ? t("Yes") : t("No")}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="mt-3 block text-sm font-semibold text-midnight">
              {t("Anything to add?")} <span className="font-normal text-slate">({t("optional")})</span>
              <textarea name="feedback" rows={2} maxLength={2000} className="mt-1 w-full rounded-lg border border-slate/25 px-2 py-1.5 text-sm font-normal" />
            </label>
            {firstError && <p className="mt-1 text-xs text-coral-ink">{t(firstError)}</p>}
            {state.message && (
              <p className="mt-1 text-xs text-coral-ink" role="alert">
                {t(state.message)}
              </p>
            )}
            <button type="submit" disabled={pending} className="mt-3 min-h-11 w-full rounded-lg bg-teal px-3 text-sm font-bold text-midnight disabled:opacity-60">
              {pending ? t("Submitting…") : t("Submit review")}
            </button>
          </form>
        )}

        {myReview &&
          (theirReview ? (
            <ReviewSummary review={theirReview} byRole={otherRole} title={t("Their review of you")} />
          ) : (
            <p className="text-xs text-slate">{t("Waiting for the other side to review too.")}</p>
          ))}
      </div>
    </div>
  );
}
