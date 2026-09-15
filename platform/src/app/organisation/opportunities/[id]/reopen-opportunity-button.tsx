"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reopenOpportunity } from "@/lib/actions/organisation";

/** S07-06: reopen a filled/closed/cancelled/expired opportunity — see reopenOpportunity. */
export function ReopenOpportunityButton({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function reopen() {
    setError(null);
    startTransition(async () => {
      const result = await reopenOpportunity(opportunityId);
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
      <button
        type="button"
        disabled={pending}
        onClick={reopen}
        className="mt-2 rounded-lg bg-teal px-3 py-1.5 text-xs font-bold text-midnight disabled:opacity-60"
      >
        {pending ? "Reopening…" : "Reopen this opportunity"}
      </button>
      {error && <p className="mt-2 text-xs text-coral-ink">{error}</p>}
    </div>
  );
}
