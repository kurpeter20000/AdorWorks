import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { alertTopicFor, isQuietTime } from "@/lib/domain/alerts";

/**
 * WhatsApp alerts (owner decision, 2026-11-16) through the WhatsApp
 * Business Cloud API. Off until WHATSAPP_TOKEN and
 * WHATSAPP_PHONE_NUMBER_ID are set. Business-started WhatsApp messages
 * must use a template approved by Meta; this sends one template
 * (WHATSAPP_TEMPLATE, default "adorworks_alert") whose body has a single
 * {{1}} placeholder filled with the alert's title.
 *
 * Never throws and never blocks the action that caused the alert: the
 * in-app notification is the record, WhatsApp is a courtesy copy.
 */
export function isWhatsAppConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export async function sendWhatsAppAlert(
  admin: SupabaseClient<Database>,
  alert: { userId: string; type: string; title: string },
  now: Date = new Date()
): Promise<"sent" | "skipped" | "failed"> {
  if (!isWhatsAppConfigured()) return "skipped";
  const topic = alertTopicFor(alert.type);
  if (!topic) return "skipped";
  try {
    const { data: prefs } = await admin
      .from("alert_preferences")
      .select("whatsapp_enabled, whatsapp_number, application_updates, messages, new_matching_work, quiet_from, quiet_until, timezone")
      .eq("user_id", alert.userId)
      .maybeSingle();
    if (!prefs?.whatsapp_enabled || !prefs.whatsapp_number || !prefs[topic]) return "skipped";
    if (isQuietTime(now, prefs.quiet_from, prefs.quiet_until, prefs.timezone)) return "skipped";

    const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: prefs.whatsapp_number.replace(/^\+/, ""),
        type: "template",
        template: {
          name: process.env.WHATSAPP_TEMPLATE || "adorworks_alert",
          language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en" },
          components: [{ type: "body", parameters: [{ type: "text", text: alert.title.slice(0, 900) }] }],
        },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("whatsapp alert failed (%s):", res.status, await res.text().catch(() => ""));
      return "failed";
    }
    return "sent";
  } catch (err) {
    console.error("whatsapp alert threw:", err);
    return "failed";
  }
}
