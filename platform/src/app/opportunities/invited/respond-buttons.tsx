"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptInvitation, declineInvitation } from "@/lib/actions/invitations";

export function RespondButtons({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function act(action: (id: string) => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action(invitationId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="text-right">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => act(acceptInvitation)}
          className="rounded-lg bg-teal px-3 py-1.5 text-xs font-bold text-midnight disabled:opacity-60"
        >
          Accept
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => act(declineInvitation)}
          className="rounded-lg border border-slate/25 px-3 py-1.5 text-xs font-semibold text-slate disabled:opacity-60"
        >
          Decline
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-coral-ink">{error}</p>}
    </div>
  );
}
