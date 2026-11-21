import { describe, it, expect, vi } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fakeSupabase";

const state = vi.hoisted(() => ({
  fake: null as null | ReturnType<typeof import("@/lib/testing/fakeSupabase").createFakeSupabase>,
  role: "finance",
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal/session", () => ({
  FINANCE_ROLES: ["finance", "admin"],
  requireRole: async (...roles: string[]) => {
    if (!roles.includes(state.role)) throw new Error("REDIRECT:/dashboard?error=forbidden");
    return { userId: "staff-1", role: state.role };
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.fake!.client }));
vi.mock("@/lib/domain/audit", () => ({ logAuditEvent: vi.fn() }));

const { recordPayoutNameCheck } = await import("./paymentChecks");
const form = (f: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(f)) fd.set(k, v);
  return fd;
};
function seed() {
  state.fake = createFakeSupabase({
    profiles: [{ id: "t-1", full_name: "John Mayen Deng" }],
    talent_profiles: [{ id: "t-1", display_name: null }],
    talent_payout_methods: [{ talent_id: "t-1", method: "mtn_momo", phone: "+211912345678", name_checked_at: null }],
  });
}

describe("wallet name check", () => {
  it("records a matching name", async () => {
    seed();
    state.role = "finance";
    const r = await recordPayoutNameCheck("t-1", {}, form({ nameOnAccount: "DENG JOHN MAYEN" }));
    expect(r).toMatchObject({ saved: true, result: "match" });
    expect(state.fake!.db.talent_payout_methods[0].name_checked_at).toBeTruthy();
  });

  it("asks for confirmation when the name is clearly different", async () => {
    seed();
    state.role = "finance";
    const first = await recordPayoutNameCheck("t-1", {}, form({ nameOnAccount: "Mary Akol" }));
    expect(first.result).toBe("different");
    expect(state.fake!.db.talent_payout_methods[0].name_checked_at ?? null).toBeNull();
    const second = await recordPayoutNameCheck("t-1", {}, form({ nameOnAccount: "Mary Akol", confirmDifferent: "on" }));
    expect(second.saved).toBe(true);
  });

  it("is finance-only", async () => {
    seed();
    state.role = "matcher";
    await expect(recordPayoutNameCheck("t-1", {}, form({ nameOnAccount: "John Deng" }))).rejects.toThrow(/forbidden/);
  });
});
