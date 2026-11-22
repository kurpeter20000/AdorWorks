"use client";

import { useState, useTransition } from "react";
import { requestFeaturing } from "@/lib/actions/featuredJobs";

/**
 * Featured jobs (0126): a paid placement at the top of the jobs list.
 * The employer asks here; our team replies with the price and payment
 * details and switches it on once paid.
 */
export function FeatureJobBox({
  opportunityId,
  status,
  featuredUntil,
  requestedAt,
}: {
  opportunityId: string;
  status: string;
  featuredUntil: string | null;
  requestedAt: string | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(Boolean(requestedAt));
  const live = Boolean(featuredUntil && new Date(featuredUntil) > new Date());
  const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  if (!["open", "pending_review"].includes(status) && !live) return null;

  return (
    <div className="mt-4 rounded-xl border border-violet/25 bg-violet/5 p-4">
      <h3 className="text-sm font-extrabold text-midnight">{live ? "This job is featured" : "Need applicants fast? Feature this job"}</h3>
      {live ? (
        <p className="mt-1 text-sm text-pretty text-slate">It shows at the top of the jobs list, with a Featured badge, until {date(featuredUntil!)}.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-pretty text-slate">
            Featured jobs show first on the AdorWorks jobs page and in talent&apos;s job search, with a Featured badge. It&apos;s a paid option: ask below and our team will send you the price and how to pay.
          </p>
          {sent ? (
            <p className="mt-2 text-sm font-semibold text-teal-ink" role="status">
              Request sent. We&apos;ll be in touch with the price and payment details.
            </p>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await requestFeaturing(opportunityId);
                  if (r.error) setError(r.error);
                  else setSent(true);
                })
              }
              className="mt-3 min-h-11 rounded-lg bg-midnight px-4 text-sm font-extrabold text-white hover:bg-midnight/90 disabled:opacity-60"
            >
              {pending ? "Sending…" : "Ask to feature this job"}
            </button>
          )}
          {error && (
            <p className="mt-2 text-sm text-coral-ink" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
