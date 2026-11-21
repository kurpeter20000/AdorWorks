"use client";

import { useState } from "react";
import { BadgeCheck } from "lucide-react";
import { useT } from "@/i18n/client";

/** Talent Charter: "Share my verified profile" — a link anyone can open to check the talent's tier (no contact details). */
export function ShareVerifiedProfile({ talentId }: { talentId: string }) {
  const t = useT();
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function share() {
    const url = `${window.location.origin}/verify/${talentId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: t("Verify me on AdorWorks"), url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setStatus("failed");
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-card border border-teal/30 bg-teal/5 px-4 py-3">
      <BadgeCheck className="size-5 shrink-0 text-teal-ink" aria-hidden="true" />
      <p className="min-w-0 flex-[1_1_14rem] text-sm text-midnight">
        {t("Send employers a link that shows your AdorWorks trust tier. It never shows your phone or email.")}
      </p>
      <button type="button" onClick={share} className="min-h-11 rounded-control bg-teal px-4 text-sm font-bold text-midnight">
        {status === "copied" ? t("Link copied") : t("Share my verified profile")}
      </button>
      {status === "failed" && (
        <p className="w-full text-xs text-coral-ink" role="alert">
          {t("Couldn't copy the link. Your link is: {url}", { url: `/verify/${talentId}` })}
        </p>
      )}
    </div>
  );
}
