import type { Metadata } from "next";
import { requireRole } from "@/lib/dal/session";
import { staffAreaRoles } from "@/lib/domain/staffAccess";
import { AssistedOnboardingConsole } from "./assisted-console";

export const metadata: Metadata = { title: "Assisted onboarding — Operations" };

export default async function OperationsAssistedOnboardingPage() {
  const session = await requireRole(...staffAreaRoles("assisted-onboarding"));
  // Add-hub / add-agent forms are admin-only in the staff API; hide them for everyone else.
  return <AssistedOnboardingConsole isAdmin={session.role === "admin"} />;
}
