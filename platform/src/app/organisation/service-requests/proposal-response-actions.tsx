"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptServiceProposal, declineServiceProposal } from "@/lib/actions/offers";

/** S09-05: employer accept/decline for a talent's service proposal. */
export function ProposalResponseActions({ offerId }: { offerId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function act(action: (id: string) => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action(offerId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => act(acceptServiceProposal)}
        className="rounded-lg bg-teal px-3 py-1.5 text-xs font-bold text-midnight disabled:opacity-60"
      >
        Accept
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => act(declineServiceProposal)}
        className="rounded-lg border border-slate/25 px-3 py-1.5 text-xs font-semibold text-slate disabled:opacity-60"
      >
        Decline
      </button>
      {error && <span className="text-xs text-coral-ink">{error}</span>}
    </div>
  );
}
