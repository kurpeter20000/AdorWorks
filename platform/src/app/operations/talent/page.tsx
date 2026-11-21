import type { Metadata } from "next";
import { requireRole } from "@/lib/dal/session";
import { staffAreaRoles } from "@/lib/domain/staffAccess";
import { TalentConsole } from "./talent-console";

export const metadata: Metadata = { title: "Talent — Operations" };

export default async function OperationsTalentPage() {
  await requireRole(...staffAreaRoles("talent"));
  return <TalentConsole />;
}
