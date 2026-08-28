import type { ReadinessState } from "@/lib/domain/readiness";
import { StatePanel } from "@/components/state-panel";

/**
 * Renders the three signals from lib/domain/readiness.ts as three
 * separate panels, deliberately never merged into one score (master doc
 * §19A: "Separate three concepts visibly").
 */
export function ReadinessPanel({ state }: { state: ReadinessState }) {
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-3">
      <StatePanel title="Readiness" tone={state.readiness.complete ? "success" : "info"}>
        {state.readiness.complete ? (
          "Your profile has everything it needs."
        ) : (
          <ul className="list-disc space-y-0.5 pl-4">
            {state.readiness.missing.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </StatePanel>
      <StatePanel title="Trust" tone="neutral">
        <p className="font-semibold text-midnight">{state.trust.label}</p>
        {state.trust.nextStep && <p className="mt-1">{state.trust.nextStep}</p>}
      </StatePanel>
      <StatePanel title="Visibility" tone={state.visibility.visible ? "success" : "info"}>
        {state.visibility.visible ? "You're publicly discoverable." : state.visibility.reason}
      </StatePanel>
    </div>
  );
}
