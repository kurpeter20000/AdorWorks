import "server-only";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * S04-05 — table-backed rate limiting for authentication endpoints
 * (migration 0063). Table-backed rather than in-memory because Vercel
 * can run multiple serverless instances — an in-memory counter
 * wouldn't actually limit anything across them.
 *
 * Fails OPEN on a database error (logs and allows the attempt) — a
 * rate-limit check that itself breaks login/signup for everyone would
 * be a worse outage than the abuse it's meant to prevent. Contrast with
 * logAuditEvent, which is fire-and-forget after the real action already
 * succeeded; this one gates the action, so its failure mode matters
 * more and is a deliberate choice, not an oversight.
 */
export type RateLimitAction = "login" | "signup" | "password_reset_request";

const WINDOWS: Record<RateLimitAction, { windowMinutes: number; maxAttempts: number }> = {
  login: { windowMinutes: 15, maxAttempts: 5 },
  signup: { windowMinutes: 60, maxAttempts: 5 },
  password_reset_request: { windowMinutes: 15, maxAttempts: 3 },
};

/** Best-effort client IP from the standard proxy header Vercel/Render set — used for signup, where the meaningful identifier is "one source creating many accounts," not any single email. */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwardedFor = h.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}

/**
 * Records this attempt and reports whether it's within the allowed
 * rate. Always records — even a rejected attempt counts, so retrying
 * immediately after a rejection doesn't reset anything.
 */
export async function checkAndRecordAttempt(
  admin: SupabaseClient<Database>,
  action: RateLimitAction,
  identifier: string
): Promise<{ allowed: boolean }> {
  const { windowMinutes, maxAttempts } = WINDOWS[action];
  const windowStart = new Date(Date.now() - windowMinutes * 60_000).toISOString();

  try {
    // Opportunistic cleanup — self-maintaining, no separate cron needed.
    await admin
      .from("auth_rate_limit_attempts")
      .delete()
      .eq("action", action)
      .eq("identifier", identifier)
      .lt("created_at", windowStart);

    const { count, error: countError } = await admin
      .from("auth_rate_limit_attempts")
      .select("*", { count: "exact", head: true })
      .eq("action", action)
      .eq("identifier", identifier)
      .gte("created_at", windowStart);
    if (countError) throw countError;

    const allowed = (count ?? 0) < maxAttempts;

    const { error: insertError } = await admin.from("auth_rate_limit_attempts").insert({ action, identifier });
    if (insertError) throw insertError;

    return { allowed };
  } catch (err) {
    console.error(`rate limit check failed for ${action}/${identifier}, failing open:`, err);
    return { allowed: true };
  }
}
