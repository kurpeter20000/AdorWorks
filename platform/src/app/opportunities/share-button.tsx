"use client";

import { useState } from "react";

/**
 * S07-10: links to the same auth-gated apply page every other in-app link
 * already uses — never exposes anything a signed-in talent couldn't
 * already reach on their own, since the recipient still needs their own
 * AdorWorks account and the opportunity still needs to be status='open'
 * for the link to resolve to anything (RLS/apply-page checks unchanged).
 */
export function ShareButton({ opportunityId }: { opportunityId: string }) {
  const [copied, setCopied] = useState(false);

  function share() {
    const url = `${window.location.origin}/opportunities/${opportunityId}/apply`;
    if (navigator.share) {
      navigator.share({ url, title: "AdorWorks opportunity" }).catch(() => {
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
      {copied ? "Link copied!" : "Share"}
    </button>
  );
}
