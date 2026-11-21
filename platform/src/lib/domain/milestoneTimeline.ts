import type { MilestoneStatus } from "@/lib/database.types";
import { msg } from "@/i18n/config";

/**
 * Spec "Payment timeline: Submitted → Approved → Released per milestone,
 * with receipt". Paid means the employer's money has reached AdorWorks;
 * Released means AdorWorks has sent the talent's share to their payout
 * method (0116: every payment is paid out, escrow or not). Labels are
 * English, translated where shown with t().
 */
export const MILESTONE_STEPS = [msg("Submitted"), msg("Approved"), msg("Paid"), msg("Released")] as const;

export function milestoneTimelineStep(
  status: MilestoneStatus,
  escrowStatus: string | null | undefined,
  disbursementStatus?: string | null
): number | null {
  switch (status) {
    case "submitted":
      return 0;
    case "approved":
      return 1;
    case "paid":
      return escrowStatus === "released" || disbursementStatus === "succeeded" ? 3 : 2;
    default:
      return null; // pending / revision requested: nothing submitted yet
  }
}
