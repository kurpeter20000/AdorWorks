"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setApplicationStage } from "@/lib/actions/applications";

export function ShortlistActions({ applicationId, opportunityId }: { applicationId: string; opportunityId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function act(stage: "shortlisted" | "rejected") {
    startTransition(async () => {
      await setApplicationStage(applicationId, opportunityId, stage);
      router.refresh();
    });
  }

  return (
    <div className="mt-3 flex gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => act("shortlisted")}
        className="rounded-lg bg-teal px-3 py-1.5 text-sm font-bold text-midnight disabled:opacity-60"
      >
        Shortlist
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => act("rejected")}
        className="rounded-lg border border-slate/25 px-3 py-1.5 text-sm font-semibold text-slate disabled:opacity-60"
      >
        Not a fit
      </button>
    </div>
  );
}
