import { describe, it, expect } from "vitest";
import { findUserByEmail } from "./findUserByEmail";

function fakeAdmin(total: number) {
  const users = Array.from({ length: total }, (_, i) => ({ id: `u${i}`, email: `user${i}@example.test` }));
  const calls: number[] = [];
  return {
    calls,
    auth: {
      admin: {
        listUsers: async ({ page, perPage }: { page: number; perPage: number }) => {
          calls.push(page);
          return { data: { users: users.slice((page - 1) * perPage, page * perPage) }, error: null };
        },
      },
    },
  };
}

describe("findUserByEmail", () => {
  it("finds a user beyond the first page (the old 50-user bug)", async () => {
    const admin = fakeAdmin(2500);
    const { user } = await findUserByEmail(admin, "USER2200@example.test ");
    expect(user?.id).toBe("u2200");
    expect(admin.calls).toEqual([1, 2, 3]);
  });

  it("returns null without error when nobody matches", async () => {
    const admin = fakeAdmin(1200);
    expect(await findUserByEmail(admin, "nobody@example.test")).toEqual({ user: null, error: null });
  });

  it("passes through lookup errors", async () => {
    const admin = { auth: { admin: { listUsers: async () => ({ data: null, error: { message: "down" } }) } } };
    expect(await findUserByEmail(admin, "a@b.c")).toEqual({ user: null, error: "down" });
  });
});
