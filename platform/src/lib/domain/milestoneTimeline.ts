import type { MilestoneStatus } from "@/lib/database.types";

/**
 * Spec "Payment timeline: Submitted → Approved → Released per milestone,
 * with receipt". Paid means the employer's money is in; Released means
 * it has gone to the talent (straight away when escrow is off, or after
 * the dispute window when it's on).
 */
export const MILESTONE_STEPS = ["Submitted", "Approved", "Paid", "Released"] as const;

export function milestoneTimelineStep(status: MilestoneStatus, escrowStatus: string | null | undefined): number | null {
  switch (status) {
    case "submitted":
      return 0;
    case "approved":
      return 1;
    case "paid":
      return escrowStatus === "held" ? 2 : 3;
    default:
      return null; // pending / revision requested: nothing submitted yet
  }
}
