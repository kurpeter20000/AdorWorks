"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setShortlistingMode } from "@/lib/actions/organisation";

export function ShortlistingModeForm({
  opportunityId,
  mode,
}: {
  opportunityId: string;
  mode: "self_service" | "staff_assisted";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function change(next: "self_service" | "staff_assisted") {
    if (next === mode) return;
    setError(null);
    startTransition(async () => {
      const result = await setShortlistingMode(opportunityId, next);
      if (result.message) {
        setError(result.message);
        return;
      }
      // Refresh, not local state — switching to self_service also changes
      // which application rows RLS lets this page see (0030), so the whole
      // applicant list needs a fresh server fetch, not just this toggle.
      router.refresh();
    });
  }

  return (
    <div className="mt-4 rounded-lg border border-slate/15 bg-cloud/60 p-3">
      <p className="text-xs font-semibold text-midnight">Who shortlists applicants?</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || mode === "staff_assisted"}
          onClick={() => change("staff_assisted")}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-60 ${
            mode === "staff_assisted" ? "bg-midnight text-white" : "border border-slate/25 text-midnight"
          }`}
        >
          AdorWorks staff
        </button>
        <button
          type="button"
          disabled={pending || mode === "self_service"}
          onClick={() => change("self_service")}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-60 ${
            mode === "self_service" ? "bg-midnight text-white" : "border border-slate/25 text-midnight"
          }`}
        >
          I&rsquo;ll shortlist myself
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-coral-ink">{error}</p>}
    </div>
  );
}
