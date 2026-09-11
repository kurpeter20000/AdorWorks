"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveOpportunity, rejectOpportunity, requestOpportunityChanges } from "@/lib/actions/operations";
import type { FormState } from "@/lib/actions/auth";

const initialState: FormState = {};

/**
 * Staff decision panel for a pending_review opportunity. Approve is a
 * plain async call (mirrors organisation/.../close-opportunity-actions.tsx
 * — no form fields, just a status flip) with a manual router.refresh();
 * reject/request-changes use useActionState the same way
 * appeal-rejection-form.tsx does, since both need a required reason and
 * Next.js already re-runs the server component after a <form action>
 * completes (the actions' own revalidatePath calls are what make that
 * refresh show the new, no-longer-pending state).
 */
export function OpportunityReviewActions({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const [approvePending, startApprove] = useTransition();
  const [approveError, setApproveError] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState<"reject" | "changes" | null>(null);

  const boundReject = rejectOpportunity.bind(null, opportunityId);
  const [rejectState, rejectAction, rejectPending] = useActionState(boundReject, initialState);
  const boundChanges = requestOpportunityChanges.bind(null, opportunityId);
  const [changesState, changesAction, changesPending] = useActionState(boundChanges, initialState);

  function handleApprove() {
    setApproveError(null);
    startApprove(async () => {
      const result = await approveOpportunity(opportunityId);
      if (result.message) {
        setApproveError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-6 rounded-xl border border-slate/15 bg-white p-4">
      <h2 className="font-bold text-midnight">Review decision</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleApprove}
          disabled={approvePending}
          className="rounded-lg bg-teal px-4 py-2 text-xs font-bold text-midnight disabled:opacity-60"
        >
          {approvePending ? "Publishing…" : "Approve & publish"}
        </button>
        <button
          type="button"
          onClick={() => setOpenForm(openForm === "changes" ? null : "changes")}
          aria-expanded={openForm === "changes"}
          className="rounded-lg border border-violet px-4 py-2 text-xs font-bold text-violet"
        >
          Request changes
        </button>
        <button
          type="button"
          onClick={() => setOpenForm(openForm === "reject" ? null : "reject")}
          aria-expanded={openForm === "reject"}
          className="rounded-lg border border-coral px-4 py-2 text-xs font-bold text-coral-ink"
        >
          Reject
        </button>
      </div>
      {approveError && (
        <p className="mt-2 text-xs text-coral-ink" role="alert">
          {approveError}
        </p>
      )}

      {openForm === "changes" && (
        <form action={changesAction} className="mt-4 space-y-2">
          <label htmlFor="changes-note" className="text-xs font-semibold text-midnight">
            What needs to change before this can be published?
          </label>
          <textarea
            id="changes-note"
            name="note"
            required
            rows={3}
            className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
          />
          {changesState.errors?.note && (
            <p className="text-xs text-coral-ink" role="alert">
              {changesState.errors.note[0]}
            </p>
          )}
          {changesState.message && (
            <p className="text-xs text-coral-ink" role="alert">
              {changesState.message}
            </p>
          )}
          <button
            type="submit"
            disabled={changesPending}
            className="rounded-lg bg-violet px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
          >
            {changesPending ? "Sending…" : "Send back for changes"}
          </button>
        </form>
      )}

      {openForm === "reject" && (
        <form action={rejectAction} className="mt-4 space-y-2">
          <label htmlFor="reject-reason" className="text-xs font-semibold text-midnight">
            Why isn&rsquo;t this being approved?
          </label>
          <textarea
            id="reject-reason"
            name="reason"
            required
            rows={3}
            className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
          />
          {rejectState.errors?.reason && (
            <p className="text-xs text-coral-ink" role="alert">
              {rejectState.errors.reason[0]}
            </p>
          )}
          {rejectState.message && (
            <p className="text-xs text-coral-ink" role="alert">
              {rejectState.message}
            </p>
          )}
          <button
            type="submit"
            disabled={rejectPending}
            className="rounded-lg bg-coral px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
          >
            {rejectPending ? "Rejecting…" : "Reject opportunity"}
          </button>
        </form>
      )}
    </div>
  );
}
