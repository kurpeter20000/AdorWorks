"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { withdrawApplication, reapplyToOpportunity } from "@/lib/actions/applications";

export function WithdrawActions({
  applicationId,
  stage,
  opportunityOpen,
}: {
  applicationId: string;
  stage: string;
  opportunityOpen: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function act(action: (id: string) => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action(applicationId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (["submitted", "shortlisted", "interviewing"].includes(stage)) {
    return (
      <div className="text-right">
        <button
          type="button"
          disabled={pending}
          onClick={() => act(withdrawApplication)}
          className="text-xs font-semibold text-coral-ink underline disabled:opacity-60"
        >
          Withdraw
        </button>
        {error && <p className="mt-1 text-xs text-coral-ink">{error}</p>}
      </div>
    );
  }

  if (stage === "withdrawn" && opportunityOpen) {
    return (
      <div className="text-right">
        <button
          type="button"
          disabled={pending}
          onClick={() => act(reapplyToOpportunity)}
          className="text-xs font-semibold text-teal-ink underline disabled:opacity-60"
        >
          Reapply
        </button>
        {error && <p className="mt-1 text-xs text-coral-ink">{error}</p>}
      </div>
    );
  }

  return null;
}
