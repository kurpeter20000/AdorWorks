import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/** profiles has no email column — it only ever lives on the auth.users record, reachable here via the admin API. */
export async function getUserEmail(admin: SupabaseClient<Database>, userId: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) return null;
  return data.user.email ?? null;
}

/**
 * Resend for transactional email (Stage 7) — chosen because nothing else
 * in this codebase sends email at all yet (Supabase Auth's own emails
 * are a separate, unrelated system), and Resend's API is a single plain
 * HTTP POST with no SDK required, matching how sms/africastalking.ts is
 * already written. Fails open by design (see the try/catch at each call
 * site, same contract as notifyUser/logAuditEvent) — a broken email send
 * must never block the real action it's describing.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || "AdorWorks <notifications@adorworks.com>";
  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY — copy .env.local.example to .env.local and fill it in.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend email send failed (${response.status}): ${body || response.statusText}`);
  }
}

/** Wraps sendEmail so a failed/unconfigured send never blocks the caller's real action — logs instead of throwing. */
export async function sendEmailSafely(to: string | null | undefined, subject: string, html: string): Promise<void> {
  if (!to) return;
  try {
    await sendEmail(to, subject, html);
  } catch (err) {
    console.error(`Email send failed to ${to} ("${subject}"):`, err instanceof Error ? err.message : err);
  }
}
