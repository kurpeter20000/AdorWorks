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

/**
 * Brevo for transactional email (Stage 7, switched from Resend) — reuses
 * the same Brevo account and verified single sender already wired in as
 * Supabase Auth's custom SMTP provider, rather than standing up a second
 * email provider that would need its own domain verification we don't
 * have yet. Fails open by design (see the try/catch at each call site,
 * same contract as notifyUser/logAuditEvent) — a broken email send must
 * never block the real action it's describing.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
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
 */
export async function sendEmailSafely(
  to: string | null | undefined,
  subject: string,
  html: string,
  context?: { admin: SupabaseClient<Database>; recipientUserId: string }
): Promise<void> {
  if (!to) return;
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
