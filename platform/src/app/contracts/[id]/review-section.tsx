"use client";

import { useActionState } from "react";
import { submitReview } from "@/lib/actions/reviews";
import type { FormState } from "@/lib/actions/auth";

const initialState: FormState = {};

function Stars({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating} out of 5 stars`} className="text-teal-ink">
      {"★".repeat(rating)}
      <span className="text-slate/30">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export function ReviewSection({
  contractId,
  reviewerRole,
  myReview,
  theirReview,
}: {
  contractId: string;
  reviewerRole: "talent" | "employer";
  myReview: { rating: number; feedback: string | null } | null;
  theirReview: { rating: number; feedback: string | null } | null;
}) {
  const boundAction = submitReview.bind(null, contractId, reviewerRole);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <div className="mt-8">
      <h2 className="font-bold text-midnight">Reviews</h2>
      <p className="mt-1 text-xs text-slate">
        Each side reviews independently — you&apos;ll see theirs once you&apos;ve submitted yours.
      </p>

      <div className="mt-3 space-y-3">
        {myReview ? (
          <div className="rounded-xl border border-slate/15 bg-white p-4">
            <p className="text-xs font-semibold text-slate">Your review</p>
            <div className="mt-1">
              <Stars rating={myReview.rating} />
            </div>
            {myReview.feedback && <p className="mt-2 text-sm text-slate">{myReview.feedback}</p>}
          </div>
        ) : (
          <form action={formAction} className="rounded-xl border border-slate/15 bg-white p-4">
            <label className="text-xs font-semibold text-midnight">Your rating</label>
            <select
              name="rating"
              required
              defaultValue=""
              className="mt-1 block w-full rounded-lg border border-slate/25 px-2 py-1.5 text-sm"
            >
              <option value="" disabled>
                Choose 1–5
              </option>
              <option value="5">5 — excellent</option>
              <option value="4">4 — good</option>
              <option value="3">3 — okay</option>
              <option value="2">2 — poor</option>
              <option value="1">1 — very poor</option>
            </select>
            <textarea
              name="feedback"
              rows={2}
              placeholder="Optional feedback"
              className="mt-2 w-full rounded-lg border border-slate/25 px-2 py-1.5 text-sm"
            />
            {state.errors?.rating && <p className="mt-1 text-xs text-coral">{state.errors.rating[0]}</p>}
            {state.message && <p className="mt-1 text-xs text-coral">{state.message}</p>}
            <button
              type="submit"
              disabled={pending}
              className="mt-2 w-full rounded-lg bg-teal px-3 py-1.5 text-sm font-bold text-midnight disabled:opacity-60"
            >
              {pending ? "Submitting…" : "Submit review"}
            </button>
          </form>
        )}

        {myReview &&
          (theirReview ? (
            <div className="rounded-xl border border-slate/15 bg-white p-4">
              <p className="text-xs font-semibold text-slate">Their review of you</p>
              <div className="mt-1">
                <Stars rating={theirReview.rating} />
              </div>
              {theirReview.feedback && <p className="mt-2 text-sm text-slate">{theirReview.feedback}</p>}
            </div>
          ) : (
            <p className="text-xs text-slate">Waiting for the other side to review too.</p>
          ))}
      </div>
    </div>
  );
}
