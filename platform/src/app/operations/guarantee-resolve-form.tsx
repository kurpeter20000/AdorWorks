"use client";

import { useActionState } from "react";
import { resolveGuaranteeRequest } from "@/lib/actions/guarantee";

export function GuaranteeResolveForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(resolveGuaranteeRequest.bind(null, requestId), {});
  if ("done" in state && state.done) return <p className="mt-2 text-xs font-semibold text-teal-ink">Updated — the employer has been told.</p>;
  return (
    <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
      <label className="text-xs">
        <span className="mb-1 block font-semibold text-midnight">Outcome</span>
        <select name="status" className="rounded-lg border border-slate/25 px-2 py-1.5 text-xs" defaultValue="replacement_sent">
          <option value="replacement_sent">New shortlist sent</option>
          <option value="credited">Fee credit applied</option>
          <option value="declined">Not covered</option>
          <option value="closed">Closed (resolved another way)</option>
        </select>
      </label>
      <label className="min-w-0 flex-1 text-xs">
        <span className="mb-1 block font-semibold text-midnight">Note to the employer</span>
        <input name="note" maxLength={2000} className="w-full rounded-lg border border-slate/25 px-2 py-1.5 text-xs" placeholder="Required if not covered" />
      </label>
      <button type="submit" disabled={pending} className="rounded-lg bg-teal px-3 py-1.5 text-xs font-bold text-midnight disabled:opacity-60">
        {pending ? "Saving…" : "Save"}
      </button>
      {state.errors?.note && <p className="w-full text-xs text-coral-ink">{state.errors.note[0]}</p>}
      {state.message && <p className="w-full text-xs text-coral-ink">{state.message}</p>}
    </form>
  );
}
