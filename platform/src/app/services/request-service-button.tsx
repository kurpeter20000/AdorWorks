"use client";

import { useActionState, useState } from "react";
import { requestService } from "@/lib/actions/serviceRequests";
import type { FormState } from "@/lib/actions/auth";

const initialState: FormState = {};

/** S09-03: employer-side "Request this service" — see requestService. */
export function RequestServiceButton({
  organisationId,
  talentServiceId,
  talentId,
  alreadyRequested,
}: {
  organisationId: string;
  talentServiceId: string;
  talentId: string;
  alreadyRequested: boolean;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = requestService.bind(null, organisationId, talentServiceId, talentId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  const sent = alreadyRequested || (state !== initialState && !state.message && !state.errors);

  if (sent) {
    return <span className="text-xs font-semibold text-teal-ink">Requested — awaiting response</span>;
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-violet underline">
        Request this service
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <textarea
        name="message"
        rows={2}
        placeholder="Tell them a bit about what you need (optional)"
        className="w-full rounded-lg border border-slate/25 px-2 py-1.5 text-xs"
      />
      {state.message && <p className="text-xs text-coral-ink">{state.message}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-violet px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send request"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-slate/25 px-3 py-1.5 text-xs font-semibold text-slate"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
