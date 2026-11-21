"use server";

import { revalidatePath } from "next/cache";
import { msg } from "@/i18n/config";
import { requireSession } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { normalisePhone } from "@/lib/domain/payoutMethods";

export type AlertPrefsState = { saved?: boolean; message?: string };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A real IANA timezone, or Juba (an unknown one would break quiet hours). */
function validTimeZone(raw: string): string {
  const tz = raw.slice(0, 64);
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return tz || "Africa/Juba";
  } catch {
    return "Africa/Juba";
  }
}

/** Saves the person's own alert settings (0114). */
export async function saveAlertPreferences(_prev: AlertPrefsState, formData: FormData): Promise<AlertPrefsState> {
  const session = await requireSession();
  const on = (k: string) => formData.get(k) === "on";
  const whatsappEnabled = on("whatsapp_enabled");
  const rawNumber = String(formData.get("whatsapp_number") ?? "").trim();
  const whatsappNumber = rawNumber ? normalisePhone(rawNumber) : null;
  if (rawNumber && !whatsappNumber) return { message: msg("Enter your WhatsApp number, like 0912 345 678.") };
  if (whatsappEnabled && !whatsappNumber) return { message: msg("Add your WhatsApp number to get WhatsApp alerts.") };

  const quiet = on("quiet_enabled");
  const from = String(formData.get("quiet_from") ?? "");
  const until = String(formData.get("quiet_until") ?? "");
  if (quiet && (!TIME.test(from) || !TIME.test(until))) return { message: msg("Choose when quiet hours start and end.") };
  const tz = validTimeZone(String(formData.get("timezone") ?? ""));

  const supabase = await createClient();
  const { error } = await supabase.from("alert_preferences").upsert(
    {
      user_id: session.userId,
      whatsapp_enabled: whatsappEnabled,
      whatsapp_number: whatsappNumber,
      application_updates: on("application_updates"),
      new_matching_work: on("new_matching_work"),
      messages: on("messages"),
      quiet_from: quiet ? from : null,
      quiet_until: quiet ? until : null,
      timezone: tz || "Africa/Juba",
    },
    { onConflict: "user_id" }
  );
  if (error) return { message: msg("Couldn't save — please try again.") };
  revalidatePath("/notifications");
  return { saved: true };
}
