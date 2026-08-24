"use client";

import { useActionState } from "react";
import { raiseDispute } from "@/lib/actions/contracts";
import type { FormState } from "@/lib/actions/auth";
import type { DisputeRow } from "@/lib/database.types";

const initialState: FormState = {};

const STATUS_LABEL: Record<string, string> = {
  open: "Open — awaiting staff review",
  investigating: "Being investigated by AdorWorks staff",
  resolved: "Resolved",
  escalated: "Escalated",
};

export function DisputeSection({
  contractId,
  contractStatus,
  disputes,
}: {
  contractId: string;
  contractStatus: string;
  disputes: DisputeRow[];
}) {
  const boundAction = raiseDispute.bind(null, contractId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  const hasOpenDispute = disputes.some((d) => d.status !== "resolved");

  return (
    <div className="mt-8">
      <h2 className="font-bold text-midnight">Disputes</h2>

      {disputes.length > 0 && (
        <ul className="mt-3 space-y-3">
          {disputes.map((d) => (
            <li key={d.id} className="rounded-xl border border-coral/30 bg-coral/5 p-4">
              <p className="text-xs font-semibold text-coral">{STATUS_LABEL[d.status] ?? d.status}</p>
              <p className="mt-1 text-sm text-midnight">{d.description}</p>
              {d.resolution && (
                <div className="mt-2 rounded-lg bg-white p-3">
                  <p className="text-xs font-semibold text-midnight">AdorWorks resolution</p>
                  <p className="mt-1 text-sm text-slate">{d.resolution}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {contractStatus === "active" && !hasOpenDispute && (
        <form action={formAction} className="mt-3 rounded-xl border border-slate/15 bg-white p-4">
          <label htmlFor="description" className="text-xs font-semibold text-midnight">
            Raise a dispute
          </label>
          <p className="mt-1 text-xs text-slate">
            This pauses the contract and brings AdorWorks staff in to review it. Use this if something has gone
            wrong that you and the other side can&rsquo;t resolve through messages.
          </p>
          <textarea
            id="description"
            name="description"
            rows={3}
            required
            placeholder="Describe what's happened…"
            className="mt-2 w-full rounded-lg border border-slate/25 px-2 py-1.5 text-sm"
          />
          {state.errors?.description && <p className="mt-1 text-xs text-coral">{state.errors.description[0]}</p>}
          {state.message && <p className="mt-1 text-xs text-coral">{state.message}</p>}
          <button
            type="submit"
            disabled={pending}
            className="mt-2 w-full rounded-lg bg-coral px-3 py-1.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {pending ? "Submitting…" : "Raise dispute"}
          </button>
        </form>
      )}
    </div>
  );
}
