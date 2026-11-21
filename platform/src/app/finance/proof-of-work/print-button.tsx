"use client";

import { useT } from "@/i18n/client";

export function PrintButton() {
  const t = useT();
  return (
    <button type="button" onClick={() => window.print()} className="min-h-11 rounded-control bg-teal px-4 text-sm font-bold text-midnight print:hidden">
      {t("Print or save as PDF")}
    </button>
  );
}
