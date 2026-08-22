"use client";

import { useState, useTransition } from "react";
import { applyToOpportunity } from "@/lib/actions/applications";

export function ApplyButton({
  opportunityId,
  alreadyApplied,
}: {
  opportunityId: string;
  alreadyApplied: boolean;
}) {
  const [applied, setApplied] = useState(alreadyApplied);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (applied) {
    return <span className="text-xs font-semibold text-slate">Applied</span>;
  }

  return (
    <div className="text-right">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await applyToOpportunity(opportunityId);
            if (result.error) {
              setError(result.error);
            } else {
              setApplied(true);
            }
          })
        }
        className="rounded-lg bg-teal px-3 py-1.5 text-sm font-bold text-midnight disabled:opacity-60"
      >
        {pending ? "Applying…" : "Apply"}
      </button>
      {error && <p className="mt-1 text-xs text-coral">{error}</p>}
    </div>
  );
}
