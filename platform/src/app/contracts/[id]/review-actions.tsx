"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveDeliverable, requestRevision } from "@/lib/actions/contracts";

export function ReviewActions({ deliverableId }: { deliverableId: string }) {
  const router = useRouter();
  const [revising, setRevising] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (revising) {
    return (
      <div className="mt-3 space-y-2 rounded-lg bg-cloud p-3">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="What needs to change?"
          className="w-full rounded-lg border border-slate/25 px-2 py-1.5 text-sm"
        />
        {error && <p className="text-xs text-coral">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRevising(false)}
            className="rounded-lg border border-slate/30 px-3 py-1.5 text-sm font-semibold text-slate"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await requestRevision(deliverableId, note);
                if (result.error) setError(result.error);
                else router.refresh();
              })
            }
            className="flex-1 rounded-lg bg-coral px-3 py-1.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {pending ? "Sending…" : "Request revision"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setRevising(true)}
          className="rounded-lg border border-slate/30 px-3 py-1.5 text-sm font-semibold text-slate"
        >
          Request revision
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await approveDeliverable(deliverableId);
              if (result.error) setError(result.error);
              else router.refresh();
            })
          }
          className="rounded-lg bg-teal px-3 py-1.5 text-sm font-bold text-midnight disabled:opacity-60"
        >
          {pending ? "Working…" : "Approve"}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-coral">{error}</p>}
    </div>
  );
}
