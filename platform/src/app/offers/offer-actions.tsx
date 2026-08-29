"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptOffer, declineOffer } from "@/lib/actions/offers";

export function OfferActions({ offerId }: { offerId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="text-right">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await declineOffer(offerId);
              if (result.error) setError(result.error);
              else router.refresh();
            })
          }
          className="rounded-lg border border-slate/30 px-3 py-1.5 text-sm font-semibold text-slate disabled:opacity-60"
        >
          Decline
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await acceptOffer(offerId);
              if (result.error) setError(result.error);
              else router.refresh();
            })
          }
          className="rounded-lg bg-teal px-3 py-1.5 text-sm font-bold text-midnight disabled:opacity-60"
        >
          {pending ? "Working…" : "Accept"}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-coral-ink">{error}</p>}
    </div>
  );
}
