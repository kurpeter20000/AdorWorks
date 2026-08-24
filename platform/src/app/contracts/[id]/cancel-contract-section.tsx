"use client";

import { useActionState, useState } from "react";
import { cancelContract } from "@/lib/actions/contracts";
import type { FormState } from "@/lib/actions/auth";

const initialState: FormState = {};

export function CancelContractSection({ contractId }: { contractId: string }) {
  const [open, setOpen] = useState(false);
  const boundAction = cancelContract.bind(null, contractId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-xs font-semibold text-slate underline">
        Cancel this contract
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-2 rounded-xl border border-slate/15 bg-white p-4">
      <p className="text-xs font-semibold text-midnight">Cancel this contract</p>
      <p className="mt-1 text-xs text-slate">
        This ends the contract immediately for both sides and can&rsquo;t be undone. If something&rsquo;s gone wrong
        that you&rsquo;d rather have AdorWorks staff look at first, raise a dispute instead.
      </p>
      <textarea
        name="reason"
        rows={2}
        required
        placeholder="Why are you cancelling?"
        className="mt-2 w-full rounded-lg border border-slate/25 px-2 py-1.5 text-sm"
      />
      {state.errors?.reason && <p className="mt-1 text-xs text-coral">{state.errors.reason[0]}</p>}
      {state.message && <p className="mt-1 text-xs text-coral">{state.message}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-slate/30 px-3 py-1.5 text-xs font-semibold text-slate"
        >
          Never mind
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-lg bg-coral px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
        >
          {pending ? "Cancelling…" : "Confirm cancellation"}
        </button>
      </div>
    </form>
  );
}
