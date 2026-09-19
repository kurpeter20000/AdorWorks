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
          maybeSingle: (...args) => singleMock(...args),
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

// A real base64url-encoded payload segment (aal2 by default) so
// requireAuth's own S14-02 MFA check passes for staff roles here —
// otherwise every staff-role test below would get 403 mfa_required
// instead of exercising the specific role gate each test names.
function makeToken(claims = { aal: "aal2" }) {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `header.${payload}.sig`;
}

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
      const res = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${makeToken()}` } });
      expect(res.status).toBe(403);
    });
  }

  it("an unknown path returns 404, not a stack trace", async () => {
    const res = await fetch(`${baseUrl}/api/does-not-exist`);
    expect(res.status).toBe(404);
  });

  // S14-04 gap-check finding: POST /api/disputes/:id/refund only had the
  // router-level requireStaff gate, letting reviewer/matcher (no other
  // financial authority anywhere else in the app) reverse a settled
  // payment. Tested separately from GATED_ROUTES since it's POST-only —
  // an unmatched GET would 404 before ever reaching the route-specific
  // requireFinanceStaff gate, which would silently skip this check.
  describe("POST /api/disputes/:id/refund (requireFinanceStaff, route-specific)", () => {
    it("rejects a request with no token", async () => {
      const res = await fetch(`${baseUrl}/api/disputes/d1/refund`, { method: "POST" });
      expect(res.status).toBe(401);
    });

    it("rejects role 'reviewer' even though it passes the router's general requireStaff gate", async () => {
      mockSignedInAs("reviewer");
      const res = await fetch(`${baseUrl}/api/disputes/d1/refund`, {
        method: "POST",
        headers: { Authorization: `Bearer ${makeToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ milestone_id: "00000000-0000-0000-0000-000000000000" }),
      });
      expect(res.status).toBe(403);
    });

    it("lets role 'finance' past the authorization gate (reaches route logic, not blocked)", async () => {
      mockSignedInAs("finance");
      const res = await fetch(`${baseUrl}/api/disputes/d1/refund`, {
        method: "POST",
        headers: { Authorization: `Bearer ${makeToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ milestone_id: "00000000-0000-0000-0000-000000000000" }),
      });
      // Not 401/403 — the mocked DB has no matching dispute, so the route
      // itself 404s. Reaching that (not an auth rejection) proves both
      // requireStaff and requireFinanceStaff let 'finance' through.
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });
});
