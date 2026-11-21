"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { respondToShortlist, requestMoreCandidates } from "@/lib/actions/shortlists";
import { VerificationBadge } from "@/components/verification-badge";
import { KIND_DECLINE } from "@/lib/domain/decisions";
import type { VerificationTier } from "@/lib/database.types";

export interface ShortlistCandidate {
  applicationId: string;
  talentId: string;
  name: string;
  headline: string | null;
  tier: VerificationTier | null;
  reviewerNote: string | null;
  have: string[];
  lack: string[];
}

/**
 * Shortlist review (0119): the 3–5 candidates AdorWorks staff picked,
 * side by side with the reviewer's note on each. One tap per candidate to
 * interview or decline kindly, or ask for more candidates.
 */
export function ShortlistReview({
  opportunityId,
  candidates,
  canDecide,
  moreRequestedAt,
}: {
  opportunityId: string;
  candidates: ShortlistCandidate[];
  canDecide: boolean;
  moreRequestedAt: string | null;
}) {
  return (
    <section id="shortlist-review" className="mt-8 scroll-mt-24 rounded-xl border border-teal/25 bg-teal/5 p-5" aria-labelledby="shortlist-review-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="shortlist-review-h" className="text-lg font-extrabold text-midnight">
          Shortlist review
        </h2>
        <span className="text-xs font-semibold text-teal-ink">Every candidate reviewed by a person at AdorWorks</span>
      </div>
      {candidates.length === 0 ? (
        <p className="mt-2 text-sm text-slate">You&rsquo;ve decided on everyone in this shortlist.</p>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {candidates.map((c) => (
            <CandidateCard key={c.applicationId} c={c} canDecide={canDecide} />
          ))}
        </ul>
      )}
      {canDecide && <AskForMore opportunityId={opportunityId} requestedAt={moreRequestedAt} />}
    </section>
  );
}

function CandidateCard({ c, canDecide }: { c: ShortlistCandidate; canDecide: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState(KIND_DECLINE);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | "interview" | "decline">(null);

  const decide = (decision: "interview" | "decline") =>
    start(async () => {
      setError(null);
      const r = await respondToShortlist(c.applicationId, decision, decision === "decline" ? note : undefined);
      if (r.error) {
        setError(r.error);
        return;
      }
      setDone(decision);
      router.refresh();
    });

  return (
    <li className="flex min-w-0 flex-col rounded-xl border border-line bg-white p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-teal/12 font-extrabold text-teal-ink">
          {c.name.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate font-bold text-midnight">{c.name}</p>
          {c.headline && <p className="line-clamp-2 text-xs text-slate">{c.headline}</p>}
          {c.tier && (
            <span className="mt-1 inline-block">
              <VerificationBadge tier={c.tier} />
            </span>
          )}
        </div>
      </div>

      {c.reviewerNote && (
        <blockquote className="mt-3 rounded-lg bg-cloud px-3 py-2 text-sm text-midnight">
          <span className="block text-[11px] font-extrabold tracking-wide text-slate uppercase">Why we picked them</span>
          {c.reviewerNote}
        </blockquote>
      )}

      {c.have.length + c.lack.length > 0 && (
        <div className="mt-3 text-xs">
          <p className="font-semibold text-midnight">
            Skills: {c.have.length} of {c.have.length + c.lack.length}
          </p>
          <ul className="mt-1 flex flex-wrap gap-1">
            {c.have.map((s) => (
              <li key={s} className="rounded-full bg-teal/12 px-2 py-0.5 font-bold text-teal-ink">
                ✓ {s}
              </li>
            ))}
            {c.lack.map((s) => (
              <li key={s} className="rounded-full border border-dashed border-slate/30 px-2 py-0.5 text-slate">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link href={`/passport/${c.talentId}`} className="mt-3 text-xs font-semibold text-teal-ink underline">
        View full Passport
      </Link>

      <div className="mt-auto pt-4">
        {done ? (
          <p className="text-sm font-semibold text-teal-ink" role="status">
            {done === "interview" ? "Moved to interview — AdorWorks will arrange a time." : "Declined with your note."}
          </p>
        ) : !canDecide ? (
          <p className="text-xs text-slate">Only team members who can hire can decide.</p>
        ) : declining ? (
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-midnight" htmlFor={`decline-${c.applicationId}`}>
              Message to the candidate
            </label>
            <textarea
              id={`decline-${c.applicationId}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              maxLength={2000}
              className="w-full rounded-lg border border-slate/25 px-2 py-1.5 text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={pending} onClick={() => decide("decline")} className="min-h-11 rounded-lg bg-midnight px-3 text-sm font-bold text-white disabled:opacity-60">
                {pending ? "Sending…" : "Send kind decline"}
              </button>
              <button type="button" onClick={() => setDeclining(false)} className="min-h-11 px-2 text-sm font-semibold text-slate">
                Back
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => decide("interview")} className="min-h-11 flex-1 rounded-lg bg-teal px-3 text-sm font-bold text-midnight disabled:opacity-60">
              {pending ? "Saving…" : "Interview"}
            </button>
            <button type="button" disabled={pending} onClick={() => setDeclining(true)} className="min-h-11 flex-1 rounded-lg border border-slate/30 px-3 text-sm font-bold text-midnight">
              Decline
            </button>
          </div>
        )}
        {error && <p className="mt-2 text-xs text-coral-ink" role="alert">{error}</p>}
      </div>
    </li>
  );
}

function AskForMore({ opportunityId, requestedAt }: { opportunityId: string; requestedAt: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (requestedAt) {
    return (
      <p className="mt-4 text-sm text-midnight" role="status">
        You asked for more candidates. AdorWorks will send a new shortlist, usually within 10 business days.
      </p>
    );
  }
  return (
    <div className="mt-4 border-t border-teal/20 pt-4">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="min-h-11 text-sm font-bold text-teal-ink underline">
          None of these fit? Ask for more candidates
        </button>
      ) : (
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-midnight" htmlFor="more-note">
            What should the next candidates have? <span className="font-normal text-slate">(optional)</span>
          </label>
          <textarea id="more-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm" />
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await requestMoreCandidates(opportunityId, note);
                if (r.error) setError(r.error);
                else router.refresh();
              })
            }
            className="min-h-11 rounded-lg bg-teal px-4 text-sm font-bold text-midnight disabled:opacity-60"
          >
            {pending ? "Sending…" : "Ask for more candidates"}
          </button>
          {error && <p className="text-xs text-coral-ink" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
