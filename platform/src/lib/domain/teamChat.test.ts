import { describe, expect, it } from "vitest";
import { cleanMessage, countUnread, parseThreadKey, threadKeyString } from "./teamChat";

const id = "11111111-2222-3333-4444-555555555555";

describe("team chat thread keys", () => {
  it("parses channel and candidate keys and rejects anything else", () => {
    expect(parseThreadKey(`c:${id}`)).toEqual({ kind: "channel", id });
    expect(parseThreadKey(`a:${id}`)).toEqual({ kind: "application", id });
    expect(parseThreadKey(`x:${id}`)).toBeNull();
    expect(parseThreadKey("c:not-a-uuid")).toBeNull();
    expect(parseThreadKey(null)).toBeNull();
    expect(threadKeyString({ kind: "application", id })).toBe(`a:${id}`);
  });
});

describe("cleanMessage", () => {
  it("trims, squeezes long blank runs and enforces limits", () => {
    expect(cleanMessage("  hi  ")).toEqual({ ok: true, body: "hi" });
    expect(cleanMessage("a\n\n\n\n\nb")).toEqual({ ok: true, body: "a\n\n\nb" });
    expect(cleanMessage("   ").ok).toBe(false);
    expect(cleanMessage("x".repeat(4001)).ok).toBe(false);
  });
});

describe("countUnread", () => {
  const msgs = [
    { sender_id: "me", created_at: "2026-11-22T10:00:00Z" },
    { sender_id: "you", created_at: "2026-11-22T10:05:00Z" },
    { sender_id: "you", created_at: "2026-11-22T10:10:00Z" },
  ];
  it("counts other people's messages after the last read", () => {
    expect(countUnread(msgs, "me", null)).toBe(2);
    expect(countUnread(msgs, "me", "2026-11-22T10:06:00Z")).toBe(1);
    expect(countUnread(msgs, "me", "2026-11-22T11:00:00Z")).toBe(0);
  });
});
