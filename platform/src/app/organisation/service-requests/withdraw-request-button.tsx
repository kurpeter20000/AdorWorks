"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { withdrawServiceRequest } from "@/lib/actions/serviceRequests";

export function WithdrawRequestButton({ requestId, organisationId }: { requestId: string; organisationId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await withdrawServiceRequest(requestId, organisationId);
            if (result.error) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
        className="text-xs font-semibold text-coral-ink underline disabled:opacity-60"
      >
        Withdraw request
      </button>
      {error && <p className="mt-1 text-xs text-coral-ink">{error}</p>}
    </div>
  );
}
