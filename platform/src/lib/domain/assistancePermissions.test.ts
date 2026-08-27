import { describe, expect, it } from "vitest";
import { isAssistanceSessionActive, isAssistanceSessionExpired } from "./assistancePermissions";

const now = new Date("2026-08-27T12:00:00.000Z");
const activeSession = {
  status: "active" as const,
  consent_recorded_at: "2026-08-27T11:00:00.000Z",
  expires_at: "2026-08-27T13:00:00.000Z",
  revoked_at: null,
  completed_at: null,
};

describe("assisted-access permission", () => {
  it("accepts only consented, unrevoked access before expiry", () => {
    expect(isAssistanceSessionActive(activeSession, now)).toBe(true);
  });

  it("rejects access at the exact expiry time", () => {
    expect(isAssistanceSessionActive({ ...activeSession, expires_at: now.toISOString() }, now)).toBe(false);
  });

  it("rejects active-looking access without consent", () => {
    expect(isAssistanceSessionActive({ ...activeSession, consent_recorded_at: null }, now)).toBe(false);
  });

  it("rejects revoked and completed sessions", () => {
    expect(isAssistanceSessionActive({ ...activeSession, revoked_at: now.toISOString() }, now)).toBe(false);
    expect(isAssistanceSessionActive({ ...activeSession, completed_at: now.toISOString() }, now)).toBe(false);
  });

  it("recognises stale pending and active sessions as expired", () => {
    const expiredAt = "2026-08-27T11:59:59.000Z";
    expect(isAssistanceSessionExpired({ status: "pending_consent", expires_at: expiredAt }, now)).toBe(true);
    expect(isAssistanceSessionExpired({ status: "active", expires_at: expiredAt }, now)).toBe(true);
  });
});
