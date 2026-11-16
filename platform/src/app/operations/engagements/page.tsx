import type { Metadata } from "next";
import { requireRole } from "@/lib/dal/session";
import { staffAreaRoles } from "@/lib/domain/staffAccess";
import { EngagementsConsole } from "./engagements-console";

export const metadata: Metadata = { title: "Engagements — Operations" };

const FILTERS = new Set(["", "proposed", "contracted", "active", "completed", "disputed", "cancelled"]);

export default async function OperationsEngagementsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireRole(...staffAreaRoles("engagements"));
  const { status } = await searchParams;
  return (
    <EngagementsConsole
      // UI hint only — the staff API re-checks finance/admin on every finance write.
      isFinanceStaff={session.role === "finance" || session.role === "admin"}
      initialFilter={status !== undefined && FILTERS.has(status) ? status : ""}
    />
  );
}
