import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-side client for the staff API (backend/api on Render).
 *
 * The /operations console is the single staff UI; the old static
 * /staff console called this same API from the browser. Calling it from
 * the server instead means no CORS allow-list to maintain and the access
 * token never has to be handed to page JavaScript. The API still does
 * every authorization check itself (requireAuth re-derives the caller's
 * role and MFA level from the token), so nothing here grants anything —
 * it only forwards the signed-in staff member's own session token.
 */
export const STAFF_API_URL = (process.env.STAFF_API_URL ?? "https://adorworks-api.onrender.com").replace(/\/$/, "");

export type StaffApiResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string; status?: number };

/** Render's free plan sleeps when idle; the first request can take ~50s while it wakes. */
const TIMEOUT_MS = 55_000;

export async function staffApiFetch<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<StaffApiResult<T>> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { ok: false, error: "Your session has expired — please sign in again.", status: 401 };

  let res: Response;
  try {
    res = await fetch(`${STAFF_API_URL}${path}`, {
      method: options.method ?? "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error(`[staffApi] ${options.method ?? "GET"} ${path} network error:`, err);
    return {
      ok: false,
      error: "Couldn't reach the staff service. It may be waking up — wait a minute and try again.",
    };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* empty or non-JSON body */
  }

  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error;
    // 4xx messages are written for staff ("already converted", "missing
    // email") and shown as-is; a 5xx carries raw database detail, so it is
    // logged and replaced with plain words.
    if (res.status >= 500) {
      console.error(`[staffApi] ${options.method ?? "GET"} ${path} failed (${res.status}):`, message);
      return {
        ok: false,
        status: res.status,
        error: "Something went wrong on our side. Please try again — if it keeps happening, tell an admin.",
      };
    }
    return { ok: false, status: res.status, error: message || `Request failed (${res.status}).` };
  }
  return { ok: true, data: body as T };
}

/** Fire-and-forget wake-up so a sleeping Render instance is warm by the time staff click something. */
export function wakeStaffApi() {
  fetch(`${STAFF_API_URL}/health`, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => {});
}
