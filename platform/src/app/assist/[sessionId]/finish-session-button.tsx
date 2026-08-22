"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { finishAssistanceSession } from "@/lib/actions/assistance";

export function FinishSessionButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await finishAssistanceSession(sessionId);
          router.push("/assist");
        })
      }
      className="rounded-lg border border-slate/30 px-4 py-2 text-sm font-bold text-slate disabled:opacity-60"
    >
      {pending ? "Finishing…" : "Finish session"}
    </button>
  );
}
