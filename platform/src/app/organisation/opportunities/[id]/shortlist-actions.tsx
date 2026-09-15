"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setApplicationStage } from "@/lib/actions/applications";

export function ShortlistActions({ applicationId, opportunityId }: { applicationId: string; opportunityId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  function shortlist() {
    startTransition(async () => {
      await setApplicationStage(applicationId, opportunityId, "shortlisted");
      router.refresh();
    });
  }

  function confirmReject() {
    startTransition(async () => {
      await setApplicationStage(applicationId, opportunityId, "rejected", reason.trim() || undefined);
      setRejecting(false);
      router.refresh();
    });
  }

  if (rejecting) {
    return (
      <div className="mt-3 space-y-2">
        <label className="block text-xs font-semibold text-slate" htmlFor={`reject-reason-${applicationId}`}>
          Let them know why (optional, but a short reason is more useful to the candidate than none)
        </label>
        <textarea
          id={`reject-reason-${applicationId}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-slate/25 p-2 text-sm"
          placeholder="e.g. We're moving forward with candidates whose experience more closely matches this role."
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={confirmReject}
            className="rounded-lg bg-midnight px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            Confirm — not a fit
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setRejecting(false)}
            className="rounded-lg border border-slate/25 px-3 py-1.5 text-sm font-semibold text-slate disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 flex gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={shortlist}
        className="rounded-lg bg-teal px-3 py-1.5 text-sm font-bold text-midnight disabled:opacity-60"
      >
        Shortlist
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setRejecting(true)}
        className="rounded-lg border border-slate/25 px-3 py-1.5 text-sm font-semibold text-slate disabled:opacity-60"
      >
        Not a fit
      </button>
    </div>
  );
}
