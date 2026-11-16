import type { Metadata } from "next";
import { requireRole } from "@/lib/dal/session";
import { staffAreaRoles } from "@/lib/domain/staffAccess";
import { IntakeConsole } from "./intake-console";

export const metadata: Metadata = { title: "Intake — Operations" };

const STATUSES = new Set(["new", "in_review", "converted", "archived", ""]);

export default async function OperationsIntakePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireRole(...staffAreaRoles("intake"));
  const { status } = await searchParams;
  return <IntakeConsole initialStatus={status !== undefined && STATUSES.has(status) ? status : "new"} />;
}
