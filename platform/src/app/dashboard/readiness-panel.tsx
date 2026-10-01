"use client";

import type { ReadinessState } from "@/lib/domain/readiness";
import { useT } from "@/i18n/client";
import { StatePanel } from "@/components/state-panel";

/**
 * Renders the three signals from lib/domain/readiness.ts as three
 * separate panels, deliberately never merged into one score (master doc
 * §19A: "Separate three concepts visibly").
 */
export function ReadinessPanel({ state }: { state: ReadinessState }) {
  const t = useT();
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-3">
      <StatePanel title={t("Readiness")} tone={state.readiness.complete ? "success" : "info"}>
        {state.readiness.complete ? (
          t("Your profile has everything it needs.")
        ) : (
          <ul className="list-disc space-y-0.5 ps-4">
            {state.readiness.missing.map((item) => (
              <li key={item}>{t(item)}</li>
            ))}
          </ul>
        )}
      </StatePanel>
      <StatePanel title={t("Trust")} tone="neutral">
        <p className="font-semibold text-midnight">{t(state.trust.label)}</p>
        {state.trust.nextStep && <p className="mt-1">{t(state.trust.nextStep)}</p>}
      </StatePanel>
      <StatePanel title={t("Visibility")} tone={state.visibility.visible ? "success" : "info"}>
        {state.visibility.visible ? t("You're publicly discoverable.") : state.visibility.reason ? t(state.visibility.reason) : null}
      </StatePanel>
    </div>
  );
}
