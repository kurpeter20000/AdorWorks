"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { finishAssistanceSession } from "@/lib/actions/assistance";

export function FinishSessionButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await finishAssistanceSession(sessionId);
            if (result.error) setError(result.error);
            else router.push("/assist");
          })
        }
        className="rounded-lg border border-slate/30 px-4 py-2 text-sm font-bold text-slate disabled:opacity-60"
      >
        {pending ? "Finishing…" : "Finish session"}
      </button>
      {error && <p className="mt-2 text-xs text-coral">{error}</p>}
    </div>
  );
}
