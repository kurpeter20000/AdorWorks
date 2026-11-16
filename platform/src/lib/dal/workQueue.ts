import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/database.types";
import { canUseStaffArea, OPPORTUNITY_REVIEW_ROLES, type StaffArea } from "@/lib/domain/staffAccess";
import { sortWorkItems, type WorkItem } from "@/lib/domain/workQueue";

/* eslint-disable @typescript-eslint/no-explicit-any -- several queue tables aren't in the hand-maintained database.types.ts */
type Row = any;

interface Queue {
  name: string;
  area: StaffArea;
  /** Narrower than the area, when only some of its roles do this job. */
  roles?: readonly UserRole[];
  load: (db: SupabaseClient) => Promise<WorkItem[]>;
}

const LIMIT = 50;
const DAY = 86_400_000;

async function rows(q: PromiseLike<{ data: Row[] | null; error: unknown }>): Promise<Row[]> {
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/**
 * Every queue staff work, each read with the signed-in staff member's own
 * session (staff RLS applies). Each loader is independent: one failing
 * doesn't hide the others, and the page says which one failed.
 */
const QUEUES: Queue[] = [
  {
    name: "Opportunities to review",
    area: "opportunities",
    roles: OPPORTUNITY_REVIEW_ROLES,
    load: async (db) =>
      (await rows(db.from("opportunities").select("id, title, updated_at").eq("status", "pending_review").order("updated_at").limit(LIMIT))).map((r) => ({
        key: `opp-${r.id}`,
        area: "opportunities",
        kind: "Opportunity to review",
        title: r.title,
        href: "/operations/opportunities?status=pending_review",
        since: r.updated_at,
        targetHours: 24,
      })),
  },
  {
    name: "Appeals",
    area: "opportunities",
    roles: OPPORTUNITY_REVIEW_ROLES,
    load: async (db) =>
      (
        await rows(
          db.from("opportunities").select("id, title, appealed_at, updated_at").eq("status", "rejected").not("appealed_at", "is", null).order("appealed_at").limit(LIMIT)
        )
      )
        // Still waiting if nothing happened after the appeal was sent
        // (the appeal itself touches updated_at in the same write).
        .filter((r) => Date.parse(r.updated_at) - Date.parse(r.appealed_at) < 60_000)
        .map((r) => ({
          key: `appeal-${r.id}`,
          area: "opportunities",
          kind: "Appeal of a rejected opportunity",
          title: r.title,
          href: "/operations/opportunities?status=rejected",
          since: r.appealed_at,
          targetHours: 48,
        })),
  },
  {
    name: "Candidates to shortlist",
    area: "opportunities",
    roles: ["admin", "matcher"],
    load: async (db) => {
      const apps = await rows(
        db
          .from("applications")
          .select("id, stage_changed_at, opportunity_id, opportunities!inner(title, shortlisting_mode)")
          .eq("stage", "submitted")
          .eq("opportunities.shortlisting_mode", "staff_assisted")
          .order("stage_changed_at")
          .limit(500)
      );
      const byOpp = new Map<string, { title: string; oldest: string; count: number }>();
      for (const a of apps) {
        const g = byOpp.get(a.opportunity_id);
        if (g) g.count += 1;
        else byOpp.set(a.opportunity_id, { title: a.opportunities?.title ?? "Opportunity", oldest: a.stage_changed_at, count: 1 });
      }
      return [...byOpp.entries()].map(([id, g]) => ({
        key: `shortlist-${id}`,
        area: "opportunities" as const,
        kind: "Candidates to shortlist",
        title: g.title,
        detail: g.count === 1 ? "1 candidate waiting" : `${g.count} candidates waiting`,
        href: "/operations/opportunities?status=open",
        since: g.oldest,
        targetHours: 72,
        // 0110 closes applications nobody moved for 14 days.
        deadline: new Date(Date.parse(g.oldest) + 14 * DAY).toISOString(),
      }));
    },
  },
  {
    name: "Services to review",
    area: "services",
    load: async (db) =>
      (await rows(db.from("talent_services").select("id, title, updated_at").eq("status", "pending_review").order("updated_at").limit(LIMIT))).map((r) => ({
        key: `svc-${r.id}`,
        area: "services",
        kind: "Service to review",
        title: r.title,
        href: "/operations/services?status=pending_review",
        since: r.updated_at,
        targetHours: 48,
      })),
  },
  {
    name: "Intake",
    area: "intake",
    load: async (db) =>
      (await rows(db.from("intake_submissions").select("id, form_type, payload, created_at").eq("status", "new").order("created_at").limit(LIMIT))).map((r) => ({
        key: `intake-${r.id}`,
        area: "intake",
        kind: "New form submission",
        title: r.payload?.name || r.payload?.organisation || r.payload?.representative_name || "Unnamed submission",
        detail: String(r.form_type).replace(/_/g, " "),
        href: "/operations/intake",
        since: r.created_at,
        targetHours: 48,
      })),
  },
  {
    name: "Talent evidence",
    area: "talent",
    load: async (db) =>
      (await rows(db.from("talent_evidence").select("id, talent_id, evidence_type, created_at").eq("status", "pending").order("created_at").limit(LIMIT))).map((r) => ({
        key: `evidence-${r.id}`,
        area: "talent",
        kind: "Evidence to check",
        title: String(r.evidence_type).replace(/_/g, " "),
        href: "/operations/talent",
        since: r.created_at,
        targetHours: 72,
      })),
  },
  {
    name: "Introduction videos",
    area: "talent",
    load: async (db) =>
      (await rows(db.from("talent_introduction_videos").select("talent_id, updated_at").eq("status", "pending").order("updated_at").limit(LIMIT))).map((r) => ({
        key: `video-${r.talent_id}`,
        area: "talent",
        kind: "Introduction video to review",
        title: "Talent introduction video",
        href: "/operations/talent",
        since: r.updated_at,
        targetHours: 72,
      })),
  },
  {
    name: "Organisation checks",
    area: "organisations",
    load: async (db) =>
      (
        await rows(
          db
            .from("verification_checks")
            .select("id, check_type, updated_at, organisations(name)")
            .in("status", ["submitted", "under_review"])
            .order("updated_at")
            .limit(LIMIT)
        )
      ).map((r) => ({
        key: `check-${r.id}`,
        area: "organisations",
        kind: r.check_type === "representative" ? "Representative check" : "Registration check",
        title: r.organisations?.name ?? "Organisation",
        href: "/operations/organisations",
        since: r.updated_at,
        targetHours: 72,
      })),
  },
  {
    name: "Reports",
    area: "reports",
    load: async (db) =>
      (await rows(db.from("reports").select("id, target_type, reason, created_at").eq("status", "open").order("created_at").limit(LIMIT))).map((r) => ({
        key: `report-${r.id}`,
        area: "reports",
        kind: "Report to handle",
        title: `${String(r.target_type).replace(/_/g, " ")} reported`,
        detail: `Reason: ${r.reason}`,
        href: "/operations/reports",
        since: r.created_at,
        targetHours: 24,
      })),
  },
  {
    name: "Disputes",
    area: "contracts",
    roles: ["admin", "trust_safety"],
    load: async (db) =>
      (await rows(db.from("disputes").select("id, status, description, created_at").in("status", ["open", "investigating"]).order("created_at").limit(LIMIT))).map((r) => ({
        key: `dispute-${r.id}`,
        area: "contracts",
        kind: r.status === "investigating" ? "Dispute under investigation" : "Dispute to open",
        title: String(r.description).slice(0, 80),
        href: "/operations/contracts?status=disputed",
        since: r.created_at,
        targetHours: 48,
      })),
  },
  {
    name: "Support messages",
    area: "support",
    load: async (db) => {
      const convs = await rows(db.from("conversations").select("id, support_user_id").not("support_user_id", "is", null).limit(200));
      if (convs.length === 0) return [];
      const msgs = await rows(
        db.from("messages").select("conversation_id, sender_id, created_at").in("conversation_id", convs.map((c) => c.id)).order("created_at", { ascending: false }).limit(1000)
      );
      const owner = new Map(convs.map((c) => [c.id, c.support_user_id]));
      const latest = new Map<string, Row>();
      for (const m of msgs) if (!latest.has(m.conversation_id)) latest.set(m.conversation_id, m);
      // Waiting = the user spoke last; the wait started at their first
      // message since staff last replied.
      const items: WorkItem[] = [];
      for (const [convId, last] of latest) {
        if (last.sender_id !== owner.get(convId)) continue;
        let since = last.created_at;
        for (const m of msgs) {
          if (m.conversation_id !== convId) continue;
          if (m.sender_id !== owner.get(convId)) break;
          since = m.created_at;
        }
        items.push({
          key: `support-${convId}`,
          area: "support",
          kind: "Support message to answer",
          title: "A user is waiting for a reply",
          href: "/operations/support",
          since,
          targetHours: 24,
        });
      }
      return items;
    },
  },
  {
    name: "Payouts",
    area: "payouts",
    load: async (db) =>
      (await rows(db.rpc("escrow_release_eligible") as unknown as PromiseLike<{ data: Row[] | null; error: unknown }>)).slice(0, LIMIT).map((r) => ({
        key: `payout-${r.payment_event_id}`,
        area: "payouts",
        kind: "Payout ready to release",
        title: `${Number(r.net_amount).toLocaleString("en-GB")} ${r.currency}`,
        href: "/operations/payouts",
        since: r.dispute_window_ends_at,
        targetHours: 24,
      })),
  },
  {
    name: "Invoices",
    area: "invoices",
    load: async (db) =>
      (
        await rows(db.from("finance_records").select("id, amount, currency, created_at").eq("record_type", "invoice").eq("status", "pending").order("created_at").limit(LIMIT))
      ).map((r) => ({
        key: `invoice-${r.id}`,
        area: "invoices",
        kind: "Bank transfer to confirm",
        title: `${Number(r.amount).toLocaleString("en-GB")} ${r.currency ?? ""}`.trim(),
        href: "/operations/invoices",
        since: r.created_at,
        targetHours: 72,
      })),
  },
  {
    name: "Help requests",
    area: "assisted-onboarding",
    load: async (db) =>
      (await rows(db.from("assistance_requests").select("id, location, preferred_language, created_at").eq("status", "pending").order("created_at").limit(LIMIT))).map((r) => ({
        key: `assist-${r.id}`,
        area: "assisted-onboarding",
        kind: "In-person help requested",
        title: r.location || "Location not given",
        detail: r.preferred_language ? `Language: ${r.preferred_language}` : undefined,
        href: "/operations/assisted-onboarding",
        since: r.created_at,
        targetHours: 24,
      })),
  },
];

export function workQueuesFor(role: UserRole): Queue[] {
  return QUEUES.filter((q) => canUseStaffArea(role, q.area) && (!q.roles || q.roles.includes(role)));
}

/** Everything waiting on this role, plus the names of any queue that failed to load. */
export async function loadWorkQueue(db: SupabaseClient, role: UserRole): Promise<{ items: WorkItem[]; failed: string[]; now: number }> {
  const queues = workQueuesFor(role);
  const results = await Promise.allSettled(queues.map((q) => q.load(db)));
  const items: WorkItem[] = [];
  const failed: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") items.push(...r.value);
    else {
      console.error(`[work-queue] "${queues[i].name}" failed:`, r.reason);
      failed.push(queues[i].name);
    }
  });
  const now = Date.now();
  return { items: sortWorkItems(items, now), failed, now };
}
