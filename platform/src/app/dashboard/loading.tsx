import { StatePanel } from "@/components/state-panel";

export default function DashboardLoading() {
  return (
    <main className="mx-auto max-w-2xl p-8" aria-busy="true">
      <StatePanel title="Loading your workspace" tone="info">
        AdorWorks is retrieving the latest information for your account.
      </StatePanel>
    </main>
  );
}
