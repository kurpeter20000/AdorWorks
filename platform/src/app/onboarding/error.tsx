"use client";

import { useEffect } from "react";
import { StatePanel } from "@/components/state-panel";
import { useT } from "@/i18n/client";

export default function OnboardingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatePanel title={t("Couldn't load this step")} tone="danger" role="alert">
      <p>{t("Your progress so far is saved. Try again, or come back later.")}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-lg bg-midnight px-4 py-2 font-semibold text-white"
      >
        {t("Try again")}
      </button>
    </StatePanel>
  );
}
