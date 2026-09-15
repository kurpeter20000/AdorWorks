"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { declineServiceRequest } from "@/lib/actions/serviceRequests";

export function DeclineRequestButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await declineServiceRequest(requestId);
            if (result.error) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
        className="text-xs font-semibold text-coral-ink underline disabled:opacity-60"
      >
        Decline this request
      </button>
      {error && <p className="mt-1 text-xs text-coral-ink">{error}</p>}
    </div>
  );
}
