"use client";

import { useEffect } from "react";
import { StatePanel } from "@/components/state-panel";

export default function PassportError({
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
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <StatePanel title="Couldn't load your Passport" tone="danger" role="alert">
        <p>Your saved information hasn&apos;t been changed. Try again, or come back later.</p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-lg bg-midnight px-4 py-2 font-semibold text-white"
        >
          Try again
        </button>
      </StatePanel>
    </main>
  );
}
