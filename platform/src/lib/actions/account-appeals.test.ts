/**
 * Public suspension appeal (0112): files an appeal only for a suspended
 * account, but answers identically either way so it can't reveal who is
 * suspended; rate limited.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fakeSupabase";

const state = vi.hoisted(() => ({
  fake: null as null | ReturnType<typeof import("@/lib/testing/fakeSupabase").createFakeSupabase>,
  allowed: true,
  users: {} as Record<string, string>,
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.fake!.client }));
vi.mock("@/lib/domain/rateLimit", () => ({
  checkAndRecordAttempt: async () => ({ allowed: state.allowed }),
  getClientIp: async () => "203.0.113.9",
}));
vi.mock("@/lib/supabase/findUserByEmail", () => ({
  findUserByEmail: async (_a: unknown, email: string) => ({ user: state.users[email] ? { id: state.users[email], email } : null, error: null }),
}));

const { submitAccountAppeal } = await import("./accountAppeals");

const form = (email: string, message = "I think this was a mistake, please look again.") => {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("message", message);
  return fd;
};

beforeEach(() => {
  state.allowed = true;
  state.users = { "sus@example.test": "p-sus", "ok@example.test": "p-ok" };
  state.fake = createFakeSupabase({
    profiles: [
      { id: "p-sus", status: "suspended" },
      { id: "p-ok", status: "active" },
    ],
    account_appeals: [],
  });
});

describe("public suspension appeal", () => {
  it("files an appeal for a suspended account", async () => {
    expect(await submitAccountAppeal({}, form("Sus@Example.test"))).toEqual({ sent: true });
    expect(state.fake!.db.account_appeals).toHaveLength(1);
    expect(state.fake!.db.account_appeals[0].profile_id).toBe("p-sus");
  });

  it("answers the same for active and unknown accounts, and files nothing", async () => {
    expect(await submitAccountAppeal({}, form("ok@example.test"))).toEqual({ sent: true });
    expect(await submitAccountAppeal({}, form("nobody@example.test"))).toEqual({ sent: true });
    expect(state.fake!.db.account_appeals).toHaveLength(0);
  });

  it("stops when the rate limit is reached", async () => {
    state.allowed = false;
    const r = await submitAccountAppeal({}, form("sus@example.test"));
    expect(r.sent).toBeUndefined();
    expect(r.message).toMatch(/Too many attempts/);
    expect(state.fake!.db.account_appeals).toHaveLength(0);
  });

  it("asks for a real message", async () => {
    expect((await submitAccountAppeal({}, form("sus@example.test", "short"))).errors?.message).toBeTruthy();
  });
});
