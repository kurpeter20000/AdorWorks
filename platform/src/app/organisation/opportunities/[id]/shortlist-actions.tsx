"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setApplicationStage } from "@/lib/actions/applications";

const KIND_DECLINE =
  "Thank you for applying. We've decided to move forward with other candidates whose experience more closely matches this role. We appreciate your time and wish you well.";

export function ShortlistActions({ applicationId, opportunityId }: { applicationId: string; opportunityId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  // A ready-written, respectful note (spec: "kind decline"). The employer
  // can edit it; an empty box is what candidates used to get.
  const [reason, setReason] = useState(KIND_DECLINE);

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
          Message to the candidate (edit if you like — it is sent with the decision)
        </label>
        <textarea
          id={`reject-reason-${applicationId}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
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
        className="min-h-10 rounded-control bg-primary px-4 text-sm font-extrabold text-white hover:bg-primary-hover disabled:opacity-60"
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
