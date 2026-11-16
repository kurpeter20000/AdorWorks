"use client";

import Link from "next/link";
import { CheckCircle2, Circle, ChevronRight } from "lucide-react";
import type { ReadinessState } from "@/lib/domain/readiness";
import { useT } from "@/i18n/client";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";

/**
 * The three signals from lib/domain/readiness.ts in one card, as three
 * clearly labelled rows — deliberately never merged into one score
 * (master doc §19A: "Separate three concepts visibly"). The progress bar
 * measures Readiness alone.
 */
export function ReadinessPanel({ state, completeHref }: { state: ReadinessState; completeHref: string }) {
  const t = useT();
  const { readiness, trust, visibility } = state;
  const done = readiness.total - readiness.missing.length;

  return (
    <section aria-labelledby="profile-status-title" className="rounded-card border border-line bg-white shadow-card">
      <h2 id="profile-status-title" className="px-5 pt-5 text-base font-extrabold text-midnight">
        {t("Your profile")}
      </h2>

      <div className="px-5 pt-4 pb-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-midnight">{t("Readiness")}</h3>
          <span className="text-xs font-semibold text-slate tabular-nums">
            {t("{done} of {total} complete", { done, total: readiness.total })}
          </span>
        </div>
        <ProgressBar
          className="mt-2"
          value={done}
          max={readiness.total}
          label={t("{done} of {total} complete", { done, total: readiness.total })}
        />
        {readiness.complete ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-teal-ink">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            {t("Your profile has everything it needs.")}
          </p>
        ) : (
          <>
            <ul className="mt-3 space-y-1.5">
              {readiness.missing.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-slate">
                  <Circle className="mt-0.5 size-4 shrink-0 text-slate/40" aria-hidden="true" />
                  {t(item)}
                </li>
              ))}
            </ul>
            <Link href={completeHref} className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-teal-ink hover:underline">
              {t("Finish your profile")}
              <ChevronRight className="size-4 rtl:rotate-180" aria-hidden="true" />
            </Link>
          </>
        )}
      </div>

      <div className="border-t border-line px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-midnight">{t("Trust")}</h3>
          <Badge variant="accent">{t(trust.label)}</Badge>
        </div>
        {trust.nextStep && <p className="mt-1.5 text-sm text-slate">{t(trust.nextStep)}</p>}
      </div>

      <div className="border-t border-line px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-midnight">{t("Visibility")}</h3>
          <Badge variant={visibility.visible ? "success" : "neutral"}>{visibility.visible ? t("Public") : t("Not public yet")}</Badge>
        </div>
        <p className="mt-1.5 text-sm text-slate">
          {visibility.visible ? t("You're publicly discoverable.") : visibility.reason ? t(visibility.reason) : null}
        </p>
      </div>
    </section>
  );
}
