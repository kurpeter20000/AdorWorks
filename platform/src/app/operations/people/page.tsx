import type { Metadata } from "next";
import { requireRole } from "@/lib/dal/session";
import { staffAreaRoles } from "@/lib/domain/staffAccess";
import { PeopleConsole } from "./people-console";

export const metadata: Metadata = { title: "People — Operations" };

export default async function OperationsPeoplePage() {
  const session = await requireRole(...staffAreaRoles("people"));
  // Each role gets its own view (people-console); the staff API enforces
  // the same limits on every request.
  return <PeopleConsole viewerRole={session.role} />;
}
