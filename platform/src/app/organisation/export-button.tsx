"use client";

import { useState, useTransition } from "react";
import { exportOrganisationRecords } from "@/lib/actions/organisationExport";

export function ExportButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function download() {
    setError(null);
    startTransition(async () => {
      const result = await exportOrganisationRecords();
      if ("message" in result) {
        setError(result.message);
        return;
      }
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={download}
        className="rounded-lg border border-slate/25 px-3 py-1.5 text-xs font-semibold text-midnight disabled:opacity-60"
      >
        {pending ? "Preparing…" : "Export contracts & payments (CSV)"}
      </button>
      {error && <p className="mt-1 text-xs text-coral-ink">{error}</p>}
    </div>
  );
}
