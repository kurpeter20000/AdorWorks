import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));
const { workQueuesFor, loadWorkQueue } = await import("./workQueue");
const { formatWaited, sortWorkItems, workItemState } = await import("@/lib/domain/workQueue");

const NOW = Date.parse("2026-11-16T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

/** Any query chain resolves to the rows given for its table (or an error). */
function fakeDb(tables: Record<string, unknown[] | Error>): SupabaseClient {
  const chain = (table: string): unknown =>
    new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            const v = tables[table] ?? [];
            const result = v instanceof Error ? { data: null, error: v } : { data: v, error: null };
            return (resolve: (r: unknown) => void) => resolve(result);
          }
          return () => chain(table);
        },
      }
    );
  return { from: (t: string) => chain(t), rpc: (fn: string) => chain(`rpc:${fn}`) } as unknown as SupabaseClient;
}

describe("staff work list", () => {
  // Loaders read the clock; pin it so ages are the same on every run.
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterAll(() => vi.useRealTimers());

  it("gives each role only its own queues", () => {
    const names = (role: Parameters<typeof workQueuesFor>[0]) => workQueuesFor(role).map((q) => q.name);
    expect(names("reviewer")).toEqual(["Opportunities to review", "Appeals", "Services to review", "Intake"]);
    expect(names("matcher")).toEqual(["Candidates to shortlist"]);
    expect(names("verifier")).toEqual(["Talent evidence", "Introduction videos", "Organisation checks"]);
    expect(names("trust_safety")).toEqual(["Reports", "Disputes", "Support messages"]);
    expect(names("finance")).toEqual(["Payouts", "Invoices"]);
    expect(names("field_support")).toEqual(["Support messages", "Help requests"]);
    expect(names("admin")).toHaveLength(14);
  });

  it("puts late items first, then oldest first", () => {
    const item = (key: string, h: number, target: number) => ({ key, area: "reports" as const, kind: "k", title: "t", href: "/", since: hoursAgo(h), targetHours: target });
    const sorted = sortWorkItems([item("fresh", 2, 24), item("late", 30, 24), item("older", 20, 24)], NOW);
    expect(sorted.map((i) => i.key)).toEqual(["late", "older", "fresh"]);
  });

  it("counts a shortlist as late when under three days are left before the 14-day close", () => {
    const base = { key: "s", area: "opportunities" as const, kind: "k", title: "t", href: "/", targetHours: 72 };
    expect(workItemState({ ...base, since: hoursAgo(24 * 12), deadline: new Date(NOW + 48 * 3_600_000).toISOString() }, NOW).overdue).toBe(true);
    expect(workItemState({ ...base, since: hoursAgo(24 * 5), deadline: new Date(NOW + 24 * 9 * 3_600_000).toISOString() }, NOW).overdue).toBe(false);
  });

  it("writes waiting times plainly", () => {
    expect(formatWaited(0.5)).toBe("under 1 h");
    expect(formatWaited(5.9)).toBe("5 h");
    expect(formatWaited(72)).toBe("3 days");
  });

  it("finds support threads where the user spoke last, timed from their first unanswered message", async () => {
    const db = fakeDb({
      conversations: [
        { id: "c1", support_user_id: "u1" },
        { id: "c2", support_user_id: "u2" },
      ],
      // newest first, as the query orders them
      messages: [
        { conversation_id: "c1", sender_id: "u1", created_at: hoursAgo(1) },
        { conversation_id: "c2", sender_id: "staff", created_at: hoursAgo(2) },
        { conversation_id: "c1", sender_id: "u1", created_at: hoursAgo(5) },
        { conversation_id: "c1", sender_id: "staff", created_at: hoursAgo(8) },
        { conversation_id: "c2", sender_id: "u2", created_at: hoursAgo(9) },
      ],
    });
    const { items } = await loadWorkQueue(db, "field_support");
    expect(items.map((i) => i.key)).toEqual(["support-c1"]);
    expect(items[0].since).toBe(hoursAgo(5));
  });

  it("groups shortlist candidates per opportunity with the 14-day deadline", async () => {
    const db = fakeDb({
      applications: [
        { id: "a1", opportunity_id: "o1", stage_changed_at: hoursAgo(200), opportunities: { title: "Nurse" } },
        { id: "a2", opportunity_id: "o1", stage_changed_at: hoursAgo(100), opportunities: { title: "Nurse" } },
        { id: "a3", opportunity_id: "o2", stage_changed_at: hoursAgo(10), opportunities: { title: "Driver" } },
      ],
    });
    const { items } = await loadWorkQueue(db, "matcher");
    expect(items.map((i) => [i.title, i.detail])).toEqual([
      ["Nurse", "2 candidates waiting"],
      ["Driver", "1 candidate waiting"],
    ]);
    expect(Date.parse(items[0].deadline!) - Date.parse(hoursAgo(200))).toBe(14 * 86_400_000);
  });

  it("treats a suspected scam report as urgent (2 h) and others as 24 h", async () => {
    const db = fakeDb({
      reports: [
        { id: "r1", target_type: "opportunity", reason: "scam", created_at: hoursAgo(3) },
        { id: "r2", target_type: "talent_profile", reason: "spam", created_at: hoursAgo(10) },
      ],
    });
    const { items, now } = await loadWorkQueue(db, "trust_safety");
    expect(items.map((i) => [i.key, i.targetHours])).toEqual([
      ["report-r1", 2],
      ["report-r2", 24],
    ]);
    expect(workItemState(items[0], now).overdue).toBe(true);
  });

  it("names a queue that failed instead of hiding it", async () => {
    const db = fakeDb({ reports: new Error("boom"), disputes: [], conversations: [] });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { failed, items } = await loadWorkQueue(db, "trust_safety");
    spy.mockRestore();
    expect(failed).toEqual(["Reports"]);
    expect(items).toEqual([]);
  });
});
