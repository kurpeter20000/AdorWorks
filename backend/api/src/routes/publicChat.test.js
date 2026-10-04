import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";

/**
 * Same boot-the-real-app pattern as authorization.integration.test.js —
 * real HTTP, real Express routing, only the Supabase client and the
 * outbound Anthropic fetch call are mocked. No real ANTHROPIC_API_KEY
 * or network access is used or required.
 */

const rpcMock = vi.fn();
const insertMock = vi.fn();

vi.mock("../supabaseAdmin.js", () => ({
  supabaseAdmin: {
    rpc: (...args) => rpcMock(...args),
    from: (...args) => ({
      insert: (...insertArgs) => insertMock(args[0], ...insertArgs),
    }),
  },
}));

const { app } = await import("../app.js");

// Captured before any spy is installed below, so making requests to our
// own local test server never counts as (or is intercepted by) the
// fetchSpy that stands in for the outbound Anthropic API call.
const realFetch = global.fetch;

let server;
let baseUrl;
let fetchSpy;
const originalApiKey = process.env.ANTHROPIC_API_KEY;

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
  process.env.ANTHROPIC_API_KEY = originalApiKey;
});

beforeEach(() => {
  rpcMock.mockReset().mockResolvedValue({ data: true, error: null });
  insertMock.mockReset().mockResolvedValue({ error: null });
  fetchSpy = vi.spyOn(global, "fetch");
});

afterEach(() => {
  fetchSpy.mockRestore();
  delete process.env.ANTHROPIC_API_KEY;
});

async function postChat(body) {
  return realFetch(`${baseUrl}/api/public/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/public/chat", () => {
  it("fails safe with 503 when ANTHROPIC_API_KEY isn't configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await postChat({ messages: [{ role: "user", content: "How does verification work?" }] });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/contact form/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns the assistant's reply on success", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: "text", text: "Registration is free for talent." }] }), {
        status: 200,
      })
    );

    const res = await postChat({ messages: [{ role: "user", content: "Is registration free?" }] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toBe("Registration is free for talent.");

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("test-key");
    expect(JSON.parse(init.body).messages).toEqual([{ role: "user", content: "Is registration free?" }]);
  });

  it("returns 502 when the Anthropic API call fails", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    fetchSpy.mockResolvedValue(new Response("boom", { status: 500 }));

    const res = await postChat({ messages: [{ role: "user", content: "Hello" }] });
    expect(res.status).toBe(502);
  });

  it("returns 429 once the rate limit is exceeded", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    rpcMock.mockResolvedValue({ data: false, error: null });

    const res = await postChat({ messages: [{ role: "user", content: "Hello" }] });
    expect(res.status).toBe(429);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects an empty messages array with 422", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const res = await postChat({ messages: [] });
    expect(res.status).toBe(422);
  });
});

describe("POST /api/public/chat/escalate", () => {
  it("records the escalation in intake_submissions and returns ok", async () => {
    const res = await realFetch(`${baseUrl}/api/public/chat/escalate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Jane Doe",
        email: "jane@example.com",
        message: "Can someone call me back?",
        transcript: [{ role: "user", content: "Is registration free?" }],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    expect(insertMock).toHaveBeenCalledWith(
      "intake_submissions",
      expect.objectContaining({
        form_type: "chatbot_escalation",
        payload: expect.objectContaining({ name: "Jane Doe", email: "jane@example.com" }),
      })
    );
  });

  it("rejects an invalid email with 422", async () => {
    const res = await realFetch(`${baseUrl}/api/public/chat/escalate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Jane", email: "not-an-email", message: "help" }),
    });
    expect(res.status).toBe(422);
  });
});
