"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { releasePayment } from "@/lib/actions/contracts";

export function ReleasePaymentButton({ milestoneId }: { milestoneId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-3 rounded-lg border border-coral/30 bg-coral/5 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-coral">Simulation — no real money moves</p>
      <p className="mt-1 text-xs text-slate">
        AdorWorks doesn&apos;t process real payments yet. This records a mock payment event so the
        milestone can be marked paid.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await releasePayment(milestoneId);
            if (result.error) setError(result.error);
            else router.refresh();
          })
        }
        className="mt-2 w-full rounded-lg bg-coral px-3 py-1.5 text-sm font-bold text-white disabled:opacity-60"
      >
        {pending ? "Recording…" : "Release simulated payment"}
      </button>
      {error && <p className="mt-1 text-xs text-coral">{error}</p>}
    </div>
  );
}
