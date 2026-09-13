import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

/**
 * S04-06/S04-14 — the existing auth.test.js unit-tests requireAuth/
 * requireStaff/etc. in isolation (calling the middleware functions
 * directly with a hand-built req/res). Real as far as it goes, but it
 * never proves those middlewares are actually WIRED UP correctly on
 * real routes — a route registered without its gate, or with the wrong
 * one, would pass every one of those unit tests and still be a real
 * vulnerability. This file closes that gap: boots the real Express app
 * (src/app.js) on a real ephemeral port and makes real HTTP requests
 * against it, one representative route per gate type actually used in
 * this app (see routes/*.js's router.use(requireAuth, ...) lines).
 *
 * Not exhaustive — 14 route files, dozens of endpoints total. This is
 * a bounded sample proving the pattern holds, not full coverage; see
 * docs/governance/stage-04-authentication-permissions-privacy.md.
 *
 * Same mocking boundary as auth.test.js (Supabase's own token
 * verification + the profile lookup) — real HTTP, real Express
 * routing/middleware dispatch, real route registration, everything
 * inside this app is genuine.
 */

const getUserMock = vi.fn();
const singleMock = vi.fn();

vi.mock("./supabaseAdmin.js", () => ({
  supabaseAdmin: {
    auth: { getUser: (...args) => getUserMock(...args) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: (...args) => singleMock(...args),
        }),
      }),
    }),
  },
}));

const { app } = await import("./app.js");

let server;
let baseUrl;

beforeAll(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });
});

afterAll(() => {
  server.close();
});

function mockSignedInAs(role) {
  getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "a@example.com" } }, error: null });
  singleMock.mockResolvedValue({ data: { id: "u1", role, status: "active", full_name: "Test User" }, error: null });
}

// One representative GET route per gate type this app actually uses.
const GATED_ROUTES = [
  { path: "/api/organisations", gate: "requireStaff", blockedRole: "talent" },
  { path: "/api/finance", gate: "requireFinanceStaff", blockedRole: "reviewer" },
  { path: "/api/people", gate: "requireAdmin", blockedRole: "finance" },
];

describe("authorization over real HTTP", () => {
  for (const { path, gate, blockedRole } of GATED_ROUTES) {
    it(`${path} (${gate}) rejects a request with no token`, async () => {
      const res = await fetch(`${baseUrl}${path}`);
      expect(res.status).toBe(401);
    });

    it(`${path} (${gate}) rejects an invalid/expired token`, async () => {
      getUserMock.mockResolvedValue({ data: null, error: { message: "invalid" } });
      const res = await fetch(`${baseUrl}${path}`, { headers: { Authorization: "Bearer badtoken" } });
      expect(res.status).toBe(401);
    });

    it(`${path} (${gate}) rejects role '${blockedRole}'`, async () => {
      mockSignedInAs(blockedRole);
      const res = await fetch(`${baseUrl}${path}`, { headers: { Authorization: "Bearer goodtoken" } });
      expect(res.status).toBe(403);
    });
  }

  it("an unknown path returns 404, not a stack trace", async () => {
    const res = await fetch(`${baseUrl}/api/does-not-exist`);
    expect(res.status).toBe(404);
  });
});
