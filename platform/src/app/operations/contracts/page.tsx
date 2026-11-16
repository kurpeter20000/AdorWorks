import type { Metadata } from "next";
import { requireRole } from "@/lib/dal/session";
import { staffAreaRoles } from "@/lib/domain/staffAccess";
import { ContractsConsole } from "./contracts-console";

export const metadata: Metadata = { title: "Contracts — Operations" };

const FILTERS = new Set(["", "active", "completed", "disputed", "cancelled"]);

export default async function OperationsContractsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireRole(...staffAreaRoles("contracts"));
  const { status } = await searchParams;
  return <ContractsConsole initialFilter={status !== undefined && FILTERS.has(status) ? status : ""} />;
}
