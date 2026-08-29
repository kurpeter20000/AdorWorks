"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Hides a service from this viewer's own future /services results — see dismissed_services (0048). */
export function DismissServiceButton({ serviceId }: { serviceId: string }) {
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
        .from("dismissed_services")
        .insert({ saver_id: user.id, service_id: serviceId });
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
