"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkSetApplicationStage } from "@/lib/actions/applications";
import { BULK_DECISION_LIMIT, KIND_DECLINE } from "@/lib/domain/decisions";
import { buttonVariants } from "@/components/ui/button";

export interface BulkApplicant {
  id: string;
  name: string;
  headline: string | null;
}

/**
 * Spec "one-tap shortlist and kind decline": pick several new applicants
 * and shortlist or decline them together (up to 50). Declines carry the
 * same editable kind note as a single decline.
 */
export function BulkDecisionPanel({ opportunityId, applicants }: { opportunityId: string; applicants: BulkApplicant[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState(KIND_DECLINE);
  const [result, setResult] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const shown = applicants.slice(0, BULK_DECISION_LIMIT);
  const allOn = shown.length > 0 && shown.every((a) => selected.has(a.id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function decide(stage: "shortlisted" | "rejected") {
    setResult(null);
    startTransition(async () => {
      const r = await bulkSetApplicationStage({
        ids: [...selected],
        opportunityId,
        stage,
        reason: stage === "rejected" ? reason.trim() || undefined : undefined,
      });
      if (r.error) {
        setResult({ tone: "error", text: r.error });
        return;
      }
      const verb = stage === "shortlisted" ? "Shortlisted" : "Declined";
      const parts = [`${verb} ${r.done}.`];
      if (r.skipped > 0) parts.push(`${r.skipped} had already been decided.`);
      if (r.failed > 0) parts.push(`${r.failed} could not be updated — try those again.`);
      setResult({ tone: r.failed > 0 ? "error" : "ok", text: parts.join(" ") });
      setSelected(new Set());
      setDeclining(false);
      router.refresh();
    });
  }

  const n = selected.size;
  return (
    <section aria-labelledby="bulk-heading" className="mt-4 rounded-card border border-line bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="bulk-heading" className="text-sm font-extrabold text-midnight">
          Decide on several at once
        </h3>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-slate">
          <input
            type="checkbox"
            className="size-5 accent-[var(--color-primary)]"
            checked={allOn}
            onChange={() => setSelected(allOn ? new Set() : new Set(shown.map((a) => a.id)))}
          />
          Select all {shown.length}
        </label>
      </div>
      {applicants.length > BULK_DECISION_LIMIT && (
        <p className="text-xs text-slate">Showing the first {BULK_DECISION_LIMIT}. Decide on these, then the rest appear.</p>
      )}

      <ul className="mt-2 max-h-72 divide-y divide-line overflow-y-auto rounded-control border border-line">
        {shown.map((a) => (
          <li key={a.id}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-cloud">
              <input type="checkbox" className="size-5 shrink-0 accent-[var(--color-primary)]" checked={selected.has(a.id)} onChange={() => toggle(a.id)} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-midnight">{a.name}</span>
                {a.headline && <span className="block truncate text-xs text-slate">{a.headline}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>

      {declining ? (
        <div className="mt-3 space-y-2">
          <label className="block text-xs font-semibold text-slate" htmlFor="bulk-decline-reason">
            Message to each candidate (edit if you like — it is sent with the decision)
          </label>
          <textarea
            id="bulk-decline-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            className="w-full rounded-control border border-slate/25 p-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending || n === 0} onClick={() => decide("rejected")} className={buttonVariants({ variant: "primary", size: "md" })}>
              {pending ? "Sending…" : `Decline ${n} and send the note`}
            </button>
            <button type="button" disabled={pending} onClick={() => setDeclining(false)} className={buttonVariants({ variant: "secondary", size: "md" })}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={pending || n === 0} onClick={() => decide("shortlisted")} className={buttonVariants({ variant: "primary", size: "md" })}>
            {pending ? "Saving…" : n === 0 ? "Shortlist selected" : `Shortlist ${n}`}
          </button>
          <button type="button" disabled={pending || n === 0} onClick={() => setDeclining(true)} className={buttonVariants({ variant: "secondary", size: "md" })}>
            {n === 0 ? "Decline selected" : `Decline ${n}`}
          </button>
        </div>
      )}

      {result && (
        <p role="status" className={`mt-2 text-sm font-semibold ${result.tone === "ok" ? "text-teal-ink" : "text-coral-ink"}`}>
          {result.text}
        </p>
      )}
    </section>
  );
}
