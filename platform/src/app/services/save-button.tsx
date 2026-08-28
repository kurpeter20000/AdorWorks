"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Bookmarks a service for later — see saved_services (0048). No-ops silently if not signed in, same as opportunities/save-button.tsx. */
export function SaveServiceButton({ serviceId, initialSaved }: { serviceId: string; initialSaved: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      if (saved) {
        await supabase.from("saved_services").delete().eq("saver_id", user.id).eq("service_id", serviceId);
        setSaved(false);
      } else {
        await supabase.from("saved_services").insert({ saver_id: user.id, service_id: serviceId });
        setSaved(true);
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={toggle}
      className={`text-xs font-semibold underline disabled:opacity-60 ${saved ? "text-violet" : "text-slate"}`}
    >
      {saved ? "Saved" : "Save for later"}
    </button>
  );
}
