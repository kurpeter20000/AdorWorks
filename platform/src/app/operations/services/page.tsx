import type { Metadata } from "next";
import { requireRole, STAFF_ROLES } from "@/lib/dal/session";
import { ServicesConsole } from "./services-console";

export const metadata: Metadata = { title: "Services — Operations" };

const FILTERS = new Set(["pending_review", "published", "paused", "rejected", ""]);

export default async function OperationsServicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireRole(...STAFF_ROLES);
  const { status } = await searchParams;
  return <ServicesConsole initialFilter={status !== undefined && FILTERS.has(status) ? status : "pending_review"} />;
}
