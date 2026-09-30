import type { Metadata } from "next";
import { requireRole, STAFF_ROLES } from "@/lib/dal/session";
import { TalentConsole } from "./talent-console";

export const metadata: Metadata = { title: "Talent — Operations" };

export default async function OperationsTalentPage() {
  await requireRole(...STAFF_ROLES);
  return <TalentConsole />;
}
