"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Hides an opportunity from this talent's own future /opportunities results — see dismissed_opportunities (0048). */
export function DismissButton({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function dismiss() {
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { error: insertError } = await supabase
        .from("dismissed_opportunities")
        .insert({ talent_id: user.id, opportunity_id: opportunityId });
      if (insertError) {
        setError("Could not update — try again.");
        return;
      }
      setDismissed(true);
      router.refresh();
    });
  }

  if (dismissed) return null;

  return (
    <span>
      <button
        type="button"
        disabled={pending}
        onClick={dismiss}
        className="text-xs font-semibold text-slate underline disabled:opacity-60"
      >
        Not interested
      </button>
      {error && <span className="ml-2 text-xs text-coral-ink">{error}</span>}
    </span>
  );
}
