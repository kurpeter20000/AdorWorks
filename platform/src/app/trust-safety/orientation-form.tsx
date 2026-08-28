"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeSafetyOrientation } from "@/lib/actions/passport";

export function OrientationForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => {
        await completeSafetyOrientation();
        router.refresh();
      })}
      className="rounded-lg bg-teal px-4 py-2 text-sm font-bold text-midnight disabled:opacity-60"
    >
      {pending ? "Saving…" : "I've read this"}
    </button>
  );
}
