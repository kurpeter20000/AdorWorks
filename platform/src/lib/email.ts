import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";

/** profiles has no email column — it only ever lives on the auth.users record, reachable here via the admin API. */
export async function getUserEmail(admin: SupabaseClient<Database>, userId: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) return null;
  return data.user.email ?? null;
}

async function sendEmailOnce(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.BREVO_FROM_EMAIL || "adorworkstest2026@11966687.brevosend.com";
  if (!apiKey) {
    throw new Error("Missing BREVO_API_KEY — copy .env.local.example to .env.local and fill it in.");
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "AdorWorks", email: fromEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Brevo email send failed (${response.status}): ${body || response.statusText}`);
  }
}

/**
 * Brevo for transactional email (Stage 7, switched from Resend) — reuses
 * the same Brevo account and verified single sender already wired in as
 * Supabase Auth's custom SMTP provider, rather than standing up a second
 * email provider that would need its own domain verification we don't
 * have yet. Fails open by design (see the try/catch at each call site,
 * same contract as notifyUser/logAuditEvent) — a broken email send must
 * never block the real action it's describing.
 *
 * S11-06: one short-backoff retry before giving up — Brevo's API can
 * fail transiently (a blip, a rate-limit hiccup), and this runs inline
 * inside a server action so there's no background job queue to hand a
 * failed send to for a "real" retry later. Not retried when the API key
 * itself is missing — that's a config error that will fail identically
 * every time, not a transient one.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  try {
    await sendEmailOnce(to, subject, html);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Missing BREVO_API_KEY")) throw err;
    await new Promise((resolve) => setTimeout(resolve, 500));
    await sendEmailOnce(to, subject, html);
  }
}

/**
 * Wraps sendEmail so a failed/unconfigured send never blocks the caller's
 * real action — logs instead of throwing.
 *
 * S11-06: that log used to be console.error only — invisible to everyone
 * but whoever happens to be tailing the server log at the right moment.
 * Pass `admin` + `recipientUserId` (available at every real call site,
 * since each already has the admin client and the user the email is for)
 * to also record the failure to audit_events, already staff-visible via
 * GET /api/people/audit-events — a systemic delivery problem now shows up
 * somewhere a human can actually see it.
 *
 * S11-07/S11-08: the same `context` is also what lets this check the
 * recipient's own opt-out flag (profiles.email_notifications_enabled,
 * 0086) before sending — every real call site already has both pieces in
 * scope, so this is the one place that needs to know about the
 * preference rather than every caller checking it individually. Opting
 * out is a deliberate no-send, not a failure, so it's neither logged as
 * one nor retried. Set `bypassPreference` for a security notice (e.g.
 * "your password was changed") that must reach the account owner even if
 * they've opted out of activity email — opting out of "tell me about
 * offers" was never meant to mean "don't tell me if my account changed."
 */
export async function sendEmailSafely(
  to: string | null | undefined,
  subject: string,
  html: string,
  context?: { admin: SupabaseClient<Database>; recipientUserId: string; bypassPreference?: boolean }
): Promise<void> {
  if (!to) return;
  if (context && !context.bypassPreference) {
    const { data: profile } = await context.admin
      .from("profiles")
      .select("email_notifications_enabled")
      .eq("id", context.recipientUserId)
      .maybeSingle();
    if (profile && profile.email_notifications_enabled === false) return;
  }
  try {
    await sendEmail(to, subject, html);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Email send failed to ${to} ("${subject}"):`, message);
    if (context) {
      await logAuditEvent(context.admin, {
        name: DOMAIN_EVENTS.EMAIL_DELIVERY_FAILED,
        actorId: null,
        subjectId: context.recipientUserId,
        entityType: "email",
        entityId: context.recipientUserId,
        source: "platform",
        reason: message,
        metadata: { subject },
      });
    }
  }
}
