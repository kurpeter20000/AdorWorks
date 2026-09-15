"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeFromShortlist } from "@/lib/actions/applications";

export function RemoveFromShortlistButton({ applicationId, opportunityId }: { applicationId: string; opportunityId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await removeFromShortlist(applicationId, opportunityId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={pending}
        onClick={remove}
        className="rounded-lg border border-slate/25 px-3 py-1.5 text-xs font-semibold text-slate disabled:opacity-60"
      >
        Remove from shortlist
      </button>
      {error && <p className="mt-1 text-xs text-coral-ink">{error}</p>}
    </div>
  );
}
