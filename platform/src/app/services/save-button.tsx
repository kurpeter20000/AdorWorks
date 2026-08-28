"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Bookmarks a service for later — see saved_services (0048). No-ops silently if not signed in, same as opportunities/save-button.tsx. */
export function SaveServiceButton({ serviceId, initialSaved }: { serviceId: string; initialSaved: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Only flip state once the write actually succeeds — see
      // opportunities/save-button.tsx for the same fix and why.
      if (saved) {
        const { error: deleteError } = await supabase
          .from("saved_services")
          .delete()
          .eq("saver_id", user.id)
          .eq("service_id", serviceId);
        if (deleteError) {
          setError("Could not update — try again.");
          return;
        }
        setSaved(false);
      } else {
        const { error: insertError } = await supabase
          .from("saved_services")
          .insert({ saver_id: user.id, service_id: serviceId });
        if (insertError) {
          setError("Could not save — try again.");
          return;
        }
        setSaved(true);
      }
      router.refresh();
    });
  }

  return (
    <span>
      <button
        type="button"
        disabled={pending}
        onClick={toggle}
        className={`text-xs font-semibold underline disabled:opacity-60 ${saved ? "text-violet" : "text-slate"}`}
      >
        {saved ? "Saved" : "Save for later"}
      </button>
      {error && <span className="ml-2 text-xs text-coral">{error}</span>}
    </span>
  );
}
