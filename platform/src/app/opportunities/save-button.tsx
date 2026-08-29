"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SaveButton({ opportunityId, initialSaved }: { opportunityId: string; initialSaved: boolean }) {
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

      // Only flip the button's state once the write actually succeeds —
      // a network drop or RLS denial must not make this lie about having
      // saved/unsaved something.
      if (saved) {
        const { error: deleteError } = await supabase
          .from("saved_opportunities")
          .delete()
          .eq("talent_id", user.id)
          .eq("opportunity_id", opportunityId);
        if (deleteError) {
          setError("Could not update — try again.");
          return;
        }
        setSaved(false);
      } else {
        const { error: insertError } = await supabase
          .from("saved_opportunities")
          .insert({ talent_id: user.id, opportunity_id: opportunityId });
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
      {error && <span className="ml-2 text-xs text-coral-ink">{error}</span>}
    </span>
  );
}
