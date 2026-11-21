import type { Metadata } from "next";
import { requireRole } from "@/lib/dal/session";
import { staffAreaRoles } from "@/lib/domain/staffAccess";
import { ReportsConsole } from "./reports-console";

export const metadata: Metadata = { title: "Reports — Operations" };

const FILTERS = new Set(["open", "reviewed", "dismissed", "actioned", ""]);

export default async function OperationsReportsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireRole(...staffAreaRoles("reports"));
  const { status } = await searchParams;
  return <ReportsConsole me={session.userId} initialFilter={status !== undefined && FILTERS.has(status) ? status : "open"} />;
}
