import { StatePanel } from "@/components/state-panel";

export default function OrganisationLoading() {
  return (
    <main className="mx-auto max-w-2xl p-8" aria-busy="true">
      <StatePanel title="Loading your organisation" tone="info">
        AdorWorks is retrieving the latest information for your organisation.
      </StatePanel>
    </main>
  );
}
