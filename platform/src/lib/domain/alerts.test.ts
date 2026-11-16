import { describe, it, expect } from "vitest";
import { alertTopicFor, isQuietTime } from "./alerts";

describe("alerts", () => {
  it("maps notification types to topics", () => {
    expect(alertTopicFor("offer_sent")).toBe("application_updates");
    expect(alertTopicFor("message_received")).toBe("messages");
    expect(alertTopicFor("password_changed")).toBeNull();
  });
  it("respects quiet hours that cross midnight, in the person's timezone", () => {
    // 20:30 UTC = 22:30 in Juba (UTC+2)
    const late = new Date("2026-11-16T20:30:00Z");
    expect(isQuietTime(late, "21:00", "07:00", "Africa/Juba")).toBe(true);
    expect(isQuietTime(late, "21:00", "07:00", "UTC")).toBe(false);
    // 06:30 UTC = 08:30 in Juba
    expect(isQuietTime(new Date("2026-11-16T06:30:00Z"), "21:00", "07:00", "Africa/Juba")).toBe(false);
    expect(isQuietTime(new Date("2026-11-16T03:00:00Z"), "21:00", "07:00", "Africa/Juba")).toBe(true);
  });
  it("handles daytime quiet hours and none at all", () => {
    expect(isQuietTime(new Date("2026-11-16T11:00:00Z"), "12:00", "14:00", "Africa/Juba")).toBe(true);
    expect(isQuietTime(new Date("2026-11-16T11:00:00Z"), null, null, "Africa/Juba")).toBe(false);
  });
});
