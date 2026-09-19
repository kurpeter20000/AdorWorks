"use client";

import { useState, useTransition } from "react";
import { unsubscribeByToken } from "@/lib/actions/unsubscribe";

export function UnsubscribeConfirmForm({ userId, token }: { userId: string; token: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; success?: boolean } | null>(null);

  if (result?.success) {
    return (
      <p className="mt-4 text-sm text-slate">
        You&rsquo;re unsubscribed — AdorWorks won&rsquo;t email you about account activity anymore. You&rsquo;ll still see
        everything in your in-app Notifications, and you can turn email back on anytime from there.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <p className="text-sm text-slate">
        Stop receiving activity emails from AdorWorks (offers, applications, milestones, and similar updates)? Your
        in-app notifications won&rsquo;t be affected.
      </p>
      {result?.error && <p className="mt-2 text-xs text-coral-ink">{result.error}</p>}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const res = await unsubscribeByToken(userId, token);
            setResult(res);
          });
        }}
        className="mt-4 rounded-lg bg-coral px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
      >
        {pending ? "Unsubscribing…" : "Yes, unsubscribe me"}
      </button>
    </div>
  );
}
