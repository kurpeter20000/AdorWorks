import { StatePanel } from "@/components/state-panel";

export default function OnboardingLoading() {
  return (
    <div aria-busy="true">
      <StatePanel title="Loading" tone="info">
        Getting your onboarding progress.
      </StatePanel>
    </div>
  );
}
