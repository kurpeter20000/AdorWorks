"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SaveButton({ opportunityId, initialSaved }: { opportunityId: string; initialSaved: boolean }) {
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
        await supabase.from("saved_opportunities").delete().eq("talent_id", user.id).eq("opportunity_id", opportunityId);
        setSaved(false);
      } else {
        await supabase.from("saved_opportunities").insert({ talent_id: user.id, opportunity_id: opportunityId });
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
