import { StatePanel } from "@/components/state-panel";

export default function OrganisationTeamLoading() {
  return (
    <main className="mx-auto max-w-2xl p-8" aria-busy="true">
      <StatePanel title="Loading your team" tone="info">
        AdorWorks is retrieving your organisation&rsquo;s team members.
      </StatePanel>
    </main>
  );
}
