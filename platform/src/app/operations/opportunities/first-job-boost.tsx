"use client";

import { useEffect, useState, useTransition } from "react";
import { addFirstJobCandidate, listFirstJobCandidates } from "@/lib/actions/shortlists";

type Candidate = { talentId: string; name: string; headline: string | null; tier: string; matches: string[] };

/**
 * First-job boost (0121): verified talent with no reviews yet get one
 * shortlist slot a month, so new people aren't stuck behind those with
 * history. Staff still decide; this only puts them in view.
 */
export function FirstJobBoost({ opportunityId, onAdded }: { opportunityId: string; onAdded: () => void }) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    listFirstJobCandidates(opportunityId).then((r) => {
      if (!live) return;
      if (r.error) setError(r.error);
      else setCandidates(r.candidates ?? []);
    });
    return () => {
      live = false;
    };
  }, [opportunityId]);

  const add = (c: Candidate) =>
    start(async () => {
      setMessage(null);
      const r = await addFirstJobCandidate(opportunityId, c.talentId);
      if (r.error) {
        setMessage(r.error);
        return;
      }
      setMessage(`${c.name} added with their first-job boost. Write a reviewer note, then send the shortlist.`);
      setCandidates((list) => (list ?? []).filter((x) => x.talentId !== c.talentId));
      onAdded();
    });

  return (
    <div className="mt-4 rounded-lg border border-violet/25 bg-violet/5 p-3">
      <p className="text-sm font-bold text-midnight">First-job boost</p>
      <p className="text-xs text-slate">
        AdorVerified talent with no reviews yet — one shortlist slot each per month. Ranked by skill overlap, then newest.
      </p>
      {error ? (
        <p className="mt-2 text-xs text-slate">{error}</p>
      ) : !candidates ? (
        <p className="mt-2 text-xs text-slate">Loading…</p>
      ) : candidates.length === 0 ? (
        <p className="mt-2 text-xs text-slate">No one eligible for a boost on this opportunity right now.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {candidates.map((c) => (
            <li key={c.talentId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="min-w-0">
                <strong>{c.name}</strong>
                {c.headline && <span className="text-slate"> — {c.headline}</span>}
                <span className="block text-xs text-slate">{c.matches.length ? `Matches: ${c.matches.join(", ")}` : "Category fit"}</span>
              </span>
              <button type="button" disabled={pending} onClick={() => add(c)} className="rounded-lg border border-violet/40 bg-white px-3 py-1.5 text-xs font-bold text-violet disabled:opacity-60">
                Add with boost
              </button>
            </li>
          ))}
        </ul>
      )}
      {message && <p className="mt-2 text-xs text-midnight" role="status">{message}</p>}
    </div>
  );
}
