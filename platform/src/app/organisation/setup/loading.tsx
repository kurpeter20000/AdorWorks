import { StatePanel } from "@/components/state-panel";

export default function OrganisationSetupLoading() {
  return (
    <main className="mx-auto max-w-2xl p-8" aria-busy="true">
      <StatePanel title="Loading" tone="info">
        AdorWorks is checking your organisation setup.
      </StatePanel>
    </main>
  );
}
