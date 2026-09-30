import type { Metadata } from "next";
import { requireRole, STAFF_ROLES } from "@/lib/dal/session";
import { OpportunitiesConsole } from "./opportunities-console";

export const metadata: Metadata = { title: "Opportunities — Operations" };

const FILTERS = new Set(["pending_review", "changes_required", "open", "paused", "filled", "closed", "expired", "rejected", ""]);

export default async function OperationsOpportunitiesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireRole(...STAFF_ROLES);
  const { status } = await searchParams;
  return <OpportunitiesConsole initialFilter={status !== undefined && FILTERS.has(status) ? status : "pending_review"} />;
}
