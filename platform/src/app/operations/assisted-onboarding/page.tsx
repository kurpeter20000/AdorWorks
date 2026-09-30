import type { Metadata } from "next";
import { requireRole, STAFF_ROLES } from "@/lib/dal/session";
import { AssistedOnboardingConsole } from "./assisted-console";

export const metadata: Metadata = { title: "Assisted onboarding — Operations" };

export default async function OperationsAssistedOnboardingPage() {
  const session = await requireRole(...STAFF_ROLES);
  // Add-hub / add-agent forms are admin-only in the staff API; hide them for everyone else.
  return <AssistedOnboardingConsole isAdmin={session.role === "admin"} />;
}
