import type { Metadata } from "next";
import { requireRole } from "@/lib/dal/session";
import { staffAreaRoles } from "@/lib/domain/staffAccess";
import { OpportunitiesConsole } from "./opportunities-console";

export const metadata: Metadata = { title: "Opportunities — Operations" };

const FILTERS = new Set(["pending_review", "changes_required", "open", "paused", "filled", "closed", "expired", "rejected", ""]);

export default async function OperationsOpportunitiesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireRole(...staffAreaRoles("opportunities"));
  const { status } = await searchParams;
  // Interview times and applicant messages are the matcher's (and admin's) job.
  return (
    <OpportunitiesConsole
      initialFilter={status !== undefined && FILTERS.has(status) ? status : "pending_review"}
      canRunInterviews={session.role === "matcher" || session.role === "admin"}
      canReview={session.role === "reviewer" || session.role === "admin"}
    />
  );
}
