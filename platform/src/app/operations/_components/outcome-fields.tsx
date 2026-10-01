"use client";

import { DISPUTE_OUTCOMES, DISPUTE_OUTCOME_LABEL } from "@/lib/domain/disputes";
import { inputClass } from "./staff-ui";

/** Outcome + a short summary both parties see — required to resolve a dispute (0097). */
export function OutcomeFields({
  outcome,
  setOutcome,
  summary,
  setSummary,
}: {
  outcome: string;
  setOutcome: (v: string) => void;
  summary: string;
  setSummary: (v: string) => void;
}) {
  return (
    <div className="mt-2 grid gap-2 rounded-lg border border-teal/30 bg-teal/5 p-2 sm:grid-cols-2">
      <select aria-label="Outcome" className={inputClass} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
        <option value="">Outcome (required)…</option>
        {DISPUTE_OUTCOMES.map((o) => (
          <option key={o} value={o}>
            {DISPUTE_OUTCOME_LABEL[o]}
          </option>
        ))}
      </select>
      <input
        aria-label="Outcome summary shown to both parties"
        className={inputClass}
        placeholder="Summary both parties will see"
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
      />
      <p className="text-xs text-slate sm:col-span-2">
        The outcome is shown to both parties and counted (without details) on their public track records.
      </p>
    </div>
  );
}
