import type { Metadata } from "next";
import { requireRole } from "@/lib/dal/session";
import { staffAreaRoles } from "@/lib/domain/staffAccess";
import { TalentConsole } from "./talent-console";
import { loadPendingTalent } from "@/lib/dal/approvals";

export const metadata: Metadata = { title: "Talent — Operations" };

export default async function OperationsTalentPage() {
  await requireRole(...staffAreaRoles("talent"));
  // 0128: new talent sign-ups waiting for staff approval.
  const pending = await loadPendingTalent();
  return <TalentConsole pending={pending} />;
}
