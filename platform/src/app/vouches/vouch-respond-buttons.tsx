"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { respondToVouch } from "@/lib/actions/vouches";
import { useT } from "@/i18n/client";

export function VouchRespondButtons({ vouchId }: { vouchId: string }) {
  const router = useRouter();
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function act(accept: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await respondToVouch(vouchId, accept);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="text-end">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => act(true)}
          className="rounded-lg bg-teal px-3 py-1.5 text-xs font-bold text-midnight disabled:opacity-60"
        >
          {t("Confirm")}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => act(false)}
          className="rounded-lg border border-slate/25 px-3 py-1.5 text-xs font-semibold text-slate disabled:opacity-60"
        >
          {t("Decline")}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-coral-ink">{t(error)}</p>}
    </div>
  );
}
