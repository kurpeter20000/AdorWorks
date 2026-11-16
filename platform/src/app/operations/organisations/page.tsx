import type { Metadata } from "next";
import { requireRole } from "@/lib/dal/session";
import { staffAreaRoles } from "@/lib/domain/staffAccess";
import { OrganisationsConsole } from "./organisations-console";

export const metadata: Metadata = { title: "Organisations — Operations" };

const FILTERS = new Set(["pending", "verified", "rejected", "suspended", ""]);

export default async function OperationsOrganisationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireRole(...staffAreaRoles("organisations"));
  const { status } = await searchParams;
  return <OrganisationsConsole initialFilter={status !== undefined && FILTERS.has(status) ? status : "pending"} />;
}
