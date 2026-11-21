import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createFakeSupabase } from "@/lib/testing/fakeSupabase";
import { sendWhatsAppAlert } from "./whatsapp";
import type { Database } from "@/lib/database.types";

const prefs = {
  user_id: "u-1",
  whatsapp_enabled: true,
  whatsapp_number: "+211912345678",
  application_updates: true,
  messages: false,
  new_matching_work: true,
  quiet_from: "21:00",
  quiet_until: "07:00",
  timezone: "Africa/Juba",
};
const noon = new Date("2026-11-16T10:00:00Z"); // 12:00 in Juba
const night = new Date("2026-11-16T21:00:00Z"); // 23:00 in Juba
let fetchMock: ReturnType<typeof vi.fn>;
const db = (rows = [prefs]) => createFakeSupabase({ alert_preferences: rows }).client as unknown as SupabaseClient<Database>;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  process.env.WHATSAPP_TOKEN = "t";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.WHATSAPP_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
});

describe("WhatsApp alerts", () => {
  it("does nothing until the WhatsApp account is connected", async () => {
    delete process.env.WHATSAPP_TOKEN;
    expect(await sendWhatsAppAlert(db(), { userId: "u-1", type: "offer_sent", title: "New offer" }, noon)).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("sends the approved template to the person's number", async () => {
    expect(await sendWhatsAppAlert(db(), { userId: "u-1", type: "offer_sent", title: "You have a new offer" }, noon)).toBe("sent");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toBe("211912345678");
    expect(body.template.name).toBe("adorworks_alert");
    expect(body.template.components[0].parameters[0].text).toBe("You have a new offer");
  });
  it("respects topics they turned off, quiet hours, and people who didn't opt in", async () => {
    expect(await sendWhatsAppAlert(db(), { userId: "u-1", type: "message_received", title: "x" }, noon)).toBe("skipped");
    expect(await sendWhatsAppAlert(db(), { userId: "u-1", type: "offer_sent", title: "x" }, night)).toBe("skipped");
    expect(await sendWhatsAppAlert(db([{ ...prefs, whatsapp_enabled: false }]), { userId: "u-1", type: "offer_sent", title: "x" }, noon)).toBe("skipped");
    expect(await sendWhatsAppAlert(db([]), { userId: "u-1", type: "offer_sent", title: "x" }, noon)).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("never throws when WhatsApp is down", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendWhatsAppAlert(db(), { userId: "u-1", type: "offer_sent", title: "x" }, noon)).toBe("failed");
  });
});
