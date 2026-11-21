import type { StaffArea } from "./staffAccess";

/**
 * One thing waiting on staff, from any queue. The staff work list
 * (/operations) merges every queue the signed-in role works, oldest
 * first, so nobody has to open ten pages to find what's waiting.
 */
export interface WorkItem {
  key: string;
  area: StaffArea;
  /** What kind of task, in plain words ("Opportunity to review"). */
  kind: string;
  title: string;
  detail?: string;
  href: string;
  /** When it started waiting on staff (ISO). */
  since: string;
  /** How long it should wait at most before it counts as late. */
  targetHours: number;
  /** A hard deadline, when there is one (e.g. the 14-day auto-close). */
  deadline?: string;
}

export type WorkItemState = { overdue: boolean; waitedHours: number; hoursLeft: number | null };

const HOUR = 3_600_000;

export function workItemState(item: WorkItem, now: number): WorkItemState {
  const waitedHours = Math.max(0, (now - Date.parse(item.since)) / HOUR);
  const hoursLeft = item.deadline ? (Date.parse(item.deadline) - now) / HOUR : null;
  // With a deadline, "late" means under three days left; otherwise past the target.
  const overdue = hoursLeft !== null ? hoursLeft < 72 : waitedHours > item.targetHours;
  return { overdue, waitedHours, hoursLeft };
}

/** Late items first, then oldest first — the order work should be done in. */
export function sortWorkItems(items: WorkItem[], now: number): WorkItem[] {
  return [...items].sort((a, b) => {
    const la = workItemState(a, now).overdue ? 0 : 1;
    const lb = workItemState(b, now).overdue ? 0 : 1;
    if (la !== lb) return la - lb;
    return Date.parse(a.since) - Date.parse(b.since);
  });
}

/** "3 h", "2 days" — short, plain, rounded down. */
export function formatWaited(hours: number): string {
  if (hours < 1) return "under 1 h";
  if (hours < 48) return `${Math.floor(hours)} h`;
  return `${Math.floor(hours / 24)} days`;
}
