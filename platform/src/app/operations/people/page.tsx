import type { Metadata } from "next";
import { requireRole, STAFF_ROLES } from "@/lib/dal/session";
import { StatePanel } from "@/components/state-panel";
import { PeopleConsole } from "./people-console";

export const metadata: Metadata = { title: "People — Operations" };

export default async function OperationsPeoplePage() {
  const session = await requireRole(...STAFF_ROLES);
  // The staff API enforces admin-only on every /api/people route; this is
  // just a clearer message than a page of permission errors.
  if (session.role !== "admin") {
    return (
      <div className="max-w-xl">
        <h1 className="mb-4 text-2xl font-extrabold text-midnight">People</h1>
        <StatePanel title="Admins only">Managing accounts and roles needs the admin role. Ask an admin if you need a change.</StatePanel>
      </div>
    );
  }
  return <PeopleConsole />;
}
