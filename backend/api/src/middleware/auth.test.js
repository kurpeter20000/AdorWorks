import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
const singleMock = vi.fn();

vi.mock("../supabaseAdmin.js", () => ({
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

const { requireAuth, requireStaff, requireAdmin, requireFinanceStaff } = await import("./auth.js");

function mockRes() {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

beforeEach(() => {
  getUserMock.mockReset();
  singleMock.mockReset();
});

describe("requireAuth", () => {
  it("rejects a request with no Authorization header", async () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = vi.fn();
    await requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a header that isn't a Bearer token", async () => {
    const req = { headers: { authorization: "Basic abc123" } };
    const res = mockRes();
    const next = vi.fn();
    await requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an invalid/expired token", async () => {
    getUserMock.mockResolvedValue({ data: null, error: { message: "invalid" } });
    const req = { headers: { authorization: "Bearer badtoken" } };
    const res = mockRes();
    const next = vi.fn();
    await requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a valid token with no matching profile", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "a@example.com" } }, error: null });
    singleMock.mockResolvedValue({ data: null, error: { message: "not found" } });
    const req = { headers: { authorization: "Bearer goodtoken" } };
    const res = mockRes();
    const next = vi.fn();
    await requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a suspended account even with a valid token", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "a@example.com" } }, error: null });
    singleMock.mockResolvedValue({ data: { id: "u1", role: "admin", status: "suspended", full_name: "A" }, error: null });
    const req = { headers: { authorization: "Bearer goodtoken" } };
    const res = mockRes();
    const next = vi.fn();
    await requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("populates req.user from the DB profile — never trusts a client-asserted role", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "a@example.com" } }, error: null });
    singleMock.mockResolvedValue({ data: { id: "u1", role: "admin", status: "active", full_name: "Admin A" }, error: null });
    // A client could send anything in the body/headers, e.g. claiming talent — requireAuth must ignore it and use the DB row.
    const req = { headers: { authorization: "Bearer goodtoken" }, body: { role: "talent" } };
    const res = mockRes();
    const next = vi.fn();
    await requireAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual({ id: "u1", role: "admin", fullName: "Admin A", email: "a@example.com" });
  });
});

describe("requireStaff", () => {
  it.each(["reviewer", "matcher", "finance", "admin"])("allows role '%s'", (role) => {
    const req = { user: { role } };
    const res = mockRes();
    const next = vi.fn();
    requireStaff(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each(["talent", "individual_client", "org_member", "org_admin", undefined])("blocks role '%s'", (role) => {
    const req = { user: role ? { role } : undefined };
    const res = mockRes();
    const next = vi.fn();
    requireStaff(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("requireAdmin", () => {
  it("allows only the admin role", () => {
    const req = { user: { role: "admin" } };
    const res = mockRes();
    const next = vi.fn();
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it.each(["reviewer", "matcher", "finance"])("blocks staff role '%s' that isn't admin", (role) => {
    const req = { user: { role } };
    const res = mockRes();
    const next = vi.fn();
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("requireFinanceStaff", () => {
  it.each(["finance", "admin"])("allows role '%s'", (role) => {
    const req = { user: { role } };
    const res = mockRes();
    const next = vi.fn();
    requireFinanceStaff(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it.each(["reviewer", "matcher", "talent"])("blocks role '%s'", (role) => {
    const req = { user: { role } };
    const res = mockRes();
    const next = vi.fn();
    requireFinanceStaff(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
