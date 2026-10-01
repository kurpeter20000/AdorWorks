"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";

/**
 * S07-10: shares the public job page (/jobs/[id]), which anyone can read
 * without an account — it only ever shows open, public opportunities.
 */
export function ShareButton({ opportunityId }: { opportunityId: string }) {
  const [copied, setCopied] = useState(false);
  const t = useT();

  function share() {
    const url = `${window.location.origin}/jobs/${opportunityId}`;
    if (navigator.share) {
      navigator.share({ url, title: t("AdorWorks opportunity") }).catch(() => {
        /* user cancelled the native share sheet — not an error */
      });
      return;
    }
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        /* clipboard access can fail silently in some browsers */
      });
  }

  return (
    <button type="button" onClick={share} className="text-xs font-semibold text-slate underline">
      {copied ? t("Link copied!") : t("Share")}
    </button>
  );
}
