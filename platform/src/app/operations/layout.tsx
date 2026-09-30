import { requireRole, STAFF_ROLES } from "@/lib/dal/session";
import { wakeStaffApi } from "@/lib/staff/api";

/**
 * The one staff console. Every section below it (talent, organisations,
 * disputes, finance, people, …) used to live in the separate static
 * /staff site; each page still re-checks the role itself, this layout
 * just gates the whole tree once and wakes the staff API early so the
 * first click isn't the one that waits for Render to spin up.
 */
export default async function OperationsLayout({ children }: { children: React.ReactNode }) {
  await requireRole(...STAFF_ROLES);
  wakeStaffApi();
  return <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-8">{children}</main>;
}
