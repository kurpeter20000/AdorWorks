"use client";

import { useEffect } from "react";
import { StatePanel } from "@/components/state-panel";

export default function OnboardingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatePanel title="Couldn't load this step" tone="danger" role="alert">
      <p>Your progress so far is saved. Try again, or come back later.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-lg bg-midnight px-4 py-2 font-semibold text-white"
      >
        Try again
      </button>
    </StatePanel>
  );
}
