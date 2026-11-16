import { getT } from "@/i18n/server";

/**
 * Default loading screen for every route without its own loading.tsx
 * (contracts, opportunity details, applications, offers, finance,
 * operations, ...). Those pages run many sequential queries; on a slow
 * mobile connection a tap used to show no feedback for seconds, which
 * invited repeat taps. A neutral page-shaped placeholder instead.
 */
export default async function Loading() {
  const t = await getT();
  return (
    <div className="mx-auto w-full max-w-4xl p-6 sm:p-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">{t("Loading")}</span>
      <div className="animate-pulse motion-reduce:animate-none" aria-hidden="true">
        <div className="h-7 w-1/3 rounded-lg bg-slate/15" />
        <div className="mt-3 h-4 w-1/2 rounded bg-slate/10" />
        <div className="mt-8 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-slate/10 bg-white p-5">
              <div className="h-4 w-2/5 rounded bg-slate/15" />
              <div className="mt-3 h-3 w-4/5 rounded bg-slate/10" />
              <div className="mt-2 h-3 w-3/5 rounded bg-slate/10" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
