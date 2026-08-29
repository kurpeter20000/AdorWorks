"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCandidateToShortlist } from "@/lib/actions/applications";

export function AddToShortlistButton({ opportunityId, talentId }: { opportunityId: string; talentId: string }) {
  const router = useRouter();
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await addCandidateToShortlist(opportunityId, talentId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setAdded(true);
      router.refresh();
    });
  }

  if (added) return <span className="text-xs font-semibold text-teal-ink">Added</span>;

  return (
    <div className="text-right">
      <button
        type="button"
        disabled={pending}
        onClick={add}
        className="rounded-lg bg-violet px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
      >
        Add to shortlist
      </button>
      {error && <p className="mt-1 text-xs text-coral-ink">{error}</p>}
    </div>
  );
}
