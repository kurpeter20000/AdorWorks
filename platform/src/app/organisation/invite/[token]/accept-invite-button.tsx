"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptTeamInvitation } from "@/lib/actions/organisationTeam";

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<string | null>(null);

  function accept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptTeamInvitation(token);
      if (result.error) {
        setError(result.error);
        return;
      }
      setAccepted(result.organisationName ?? "the organisation");
    });
  }

  if (accepted) {
    return (
      <div className="mt-4 rounded-xl border border-teal-ink/20 bg-teal-ink/5 p-4 text-sm text-teal-ink">
        You&rsquo;ve joined {accepted}.{" "}
        <button type="button" onClick={() => router.push("/organisation")} className="font-semibold underline">
          Go to your organisation
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        disabled={pending}
        onClick={accept}
        className="rounded-lg bg-teal px-4 py-2 text-sm font-bold text-midnight disabled:opacity-60"
      >
        {pending ? "Joining…" : "Accept invitation"}
      </button>
      {error && <p className="mt-2 text-sm text-coral-ink">{error}</p>}
    </div>
  );
}
