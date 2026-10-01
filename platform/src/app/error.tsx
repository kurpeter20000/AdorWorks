"use client";

import { useEffect } from "react";
import { StatePanel } from "@/components/state-panel";
import { useT } from "@/i18n/client";

export default function ErrorPage({
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
    <main className="mx-auto max-w-2xl p-8">
      <StatePanel title={t("Something went wrong")} tone="danger" role="alert">
        <p>{t("We could not load this screen. Your existing data has not been changed.")}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-lg bg-midnight px-4 py-2 font-semibold text-white"
        >
          {t("Try again")}
        </button>
      </StatePanel>
    </main>
  );
}
