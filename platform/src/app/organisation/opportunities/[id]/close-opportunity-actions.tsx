"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { closeOpportunity } from "@/lib/actions/organisation";

const ACTIONS: { status: "filled" | "closed" | "cancelled"; label: string }[] = [
  { status: "filled", label: "Mark as filled" },
  { status: "closed", label: "Close" },
  { status: "cancelled", label: "Cancel" },
];

/** Self-service end-of-life actions for an 'open' opportunity — see closeOpportunity. */
export function CloseOpportunityActions({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function act(status: "filled" | "closed" | "cancelled") {
    setError(null);
    startTransition(async () => {
      const result = await closeOpportunity(opportunityId, status);
      if (result.message) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-4 rounded-lg border border-slate/15 bg-cloud/60 p-3">
      <p className="text-xs font-semibold text-midnight">Done with this opportunity?</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.status}
            type="button"
            disabled={pending}
            onClick={() => act(a.status)}
            className="rounded-lg border border-slate/25 px-3 py-1.5 text-xs font-bold text-midnight disabled:opacity-60"
          >
            {a.label}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-coral">{error}</p>}
    </div>
  );
}
