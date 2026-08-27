"use client";

import { useEffect } from "react";
import { StatePanel } from "@/components/state-panel";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <StatePanel title="Something went wrong" tone="danger" role="alert">
        <p>We could not load this screen. Your existing data has not been changed.</p>
        <button
          type="button"
          onClick={retry}
          className="mt-4 rounded-lg bg-midnight px-4 py-2 font-semibold text-white"
        >
          Try again
        </button>
      </StatePanel>
    </main>
  );
}
