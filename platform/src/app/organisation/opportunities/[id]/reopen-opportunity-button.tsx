"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reopenOpportunity } from "@/lib/actions/organisation";

/**
 * S07-06: reopen a filled/closed/cancelled/expired opportunity — see
 * reopenOpportunity. An expired listing almost always got there because
 * its old applicationDeadline passed, so this lets the employer set a
 * new one in the same step rather than reopening into an immediate
 * re-expiry on the next run of the auto-expiry job.
 */
export function ReopenOpportunityButton({
  opportunityId,
  currentDeadline,
  expired,
}: {
  opportunityId: string;
  currentDeadline: string | null;
  expired: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deadline, setDeadline] = useState(expired ? "" : (currentDeadline ?? ""));
  const today = new Date().toISOString().slice(0, 10);

  function reopen() {
    setError(null);
    startTransition(async () => {
      const result = await reopenOpportunity(opportunityId, deadline);
      if (result.message) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-4 rounded-lg border border-slate/15 bg-cloud/60 p-3">
      <p className="text-xs font-semibold text-midnight">Changed your mind?</p>
      {expired && (
        <p className="mt-1 text-xs text-slate">
          This listing closed because its application deadline passed — set a new one so it can take applications again.
        </p>
      )}
      <label htmlFor="reopen-deadline" className="mt-2 block text-xs font-semibold text-midnight">
        {expired ? "New apply-by date" : "Apply by (optional)"}
      </label>
      <input
        id="reopen-deadline"
        type="date"
        min={today}
        value={deadline}
        onChange={(e) => setDeadline(e.target.value)}
        className="mt-1 w-full max-w-[200px] rounded-lg border border-slate/25 px-3 py-2 text-sm"
      />
      <button
        type="button"
        disabled={pending}
        onClick={reopen}
        className="mt-2 block rounded-lg bg-teal px-3 py-1.5 text-xs font-bold text-midnight disabled:opacity-60"
      >
        {pending ? "Reopening…" : "Reopen this opportunity"}
      </button>
      {error && <p className="mt-2 text-xs text-coral-ink">{error}</p>}
    </div>
  );
}
