import type { Metadata } from "next";
import { requireRole } from "@/lib/dal/session";
import { staffAreaRoles } from "@/lib/domain/staffAccess";
import { OrganisationsConsole } from "./organisations-console";
import { loadPendingEmployers } from "@/lib/dal/approvals";

export const metadata: Metadata = { title: "Organisations — Operations" };

const FILTERS = new Set(["pending", "verified", "rejected", "suspended", ""]);

export default async function OperationsOrganisationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireRole(...staffAreaRoles("organisations"));
  const { status } = await searchParams;
  // 0128: new employer sign-ups waiting for staff approval.
  const pending = await loadPendingEmployers();
  return <OrganisationsConsole initialFilter={status !== undefined && FILTERS.has(status) ? status : "pending"} pending={pending} />;
}
