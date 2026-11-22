"use server";

import { revalidatePath } from "next/cache";
import { msg } from "@/i18n/config";
import { requireSession } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { normalisePhone } from "@/lib/domain/payoutMethods";
import { splitList } from "@/lib/domain/jobAlerts";
import { CATEGORY_LABEL, ENGAGEMENT_TYPE_LABEL, WORK_MODE_LABEL } from "@/lib/domain/taxonomy";

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

/**
 * Tailored job alerts (0126): talent only, off until they switch it on.
 * new_matching_work follows the switch so WhatsApp (lib/whatsapp) sends
 * job alerts only to people who asked for them.
 */
export async function saveJobAlerts(_prev: AlertPrefsState, formData: FormData): Promise<AlertPrefsState> {
  const session = await requireSession();
  if (session.role !== "talent") return { message: msg("Job alerts are for talent accounts.") };
  const enabled = formData.get("job_alerts_enabled") === "on";
  const pick = (key: string, allowed: string[], max: number) =>
    [...new Set(formData.getAll(key).map(String))].filter((v) => allowed.includes(v)).slice(0, max);

  const supabase = await createClient();
  const { error } = await supabase.from("alert_preferences").upsert(
    {
      user_id: session.userId,
      job_alerts_enabled: enabled,
      new_matching_work: enabled,
      job_alert_categories: pick("job_alert_categories", Object.keys(CATEGORY_LABEL), 3),
      job_alert_engagement_types: pick("job_alert_engagement_types", Object.keys(ENGAGEMENT_TYPE_LABEL), 10),
      job_alert_work_modes: pick("job_alert_work_modes", Object.keys(WORK_MODE_LABEL).filter((m) => m !== "any"), 4),
      job_alert_keywords: splitList(String(formData.get("job_alert_keywords") ?? ""), 20),
      job_alert_locations: splitList(String(formData.get("job_alert_locations") ?? ""), 10, 80),
      job_alert_email: formData.get("job_alert_email") === "on",
    },
    { onConflict: "user_id" }
  );
  if (error) return { message: msg("Couldn't save — please try again.") };
  revalidatePath("/notifications");
  return { saved: true };
}
