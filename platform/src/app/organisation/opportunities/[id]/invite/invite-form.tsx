"use client";

import { useState, useTransition } from "react";
import { inviteTalent } from "@/lib/actions/invitations";

export function InviteForm({ opportunityId, talentId }: { opportunityId: string; talentId: string }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (sent) return <span className="text-xs font-semibold text-teal-ink">Invited</span>;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-violet px-3 py-1.5 text-xs font-bold text-white"
      >
        Invite to apply
      </button>
    );
  }

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await inviteTalent(opportunityId, talentId, {}, formData);
          if (result.message) {
            setError(result.message);
            return;
          }
          setSent(true);
        });
      }}
      className="space-y-2"
    >
      <textarea
        name="message"
        rows={2}
        placeholder="A short note about why you're reaching out (optional)"
        className="w-full rounded-lg border border-slate/25 px-2 py-1.5 text-xs"
      />
      {error && <p className="text-xs text-coral-ink">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-violet px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send invitation"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-slate underline">
          Cancel
        </button>
      </div>
    </form>
  );
}
