import { StatePanel } from "@/components/state-panel";

export default function PassportLoading() {
  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8" aria-busy="true">
      <StatePanel title="Loading your Passport" tone="info">
        Getting your profile, portfolio and verification status.
      </StatePanel>
    </main>
  );
}
