"use server";

import { requireRole, STAFF_ROLES } from "@/lib/dal/session";
import { staffApiFetch, type StaffApiResult } from "@/lib/staff/api";

const METHODS = new Set(["GET", "POST", "PATCH", "DELETE"]);
// Only the staff API's own /api/* routes, no scheme/host, no "..".
const SAFE_PATH = /^\/api\/[A-Za-z0-9_\-/]+(\?[A-Za-z0-9_\-.,:=&%+]*)?$/;

/**
 * The one bridge from /operations client components to the staff API.
 * It forwards the caller's own session token only, so it can never do
 * more than that staff member could by calling the API directly; the
 * API re-checks role, status and MFA level on every request.
 */
export async function callStaffApi<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<StaffApiResult<T>> {
  await requireRole(...STAFF_ROLES);
  const verb = method.toUpperCase();
  if (!METHODS.has(verb) || !SAFE_PATH.test(path) || path.includes("..")) {
    return { ok: false, error: "Invalid request." };
  }
  return staffApiFetch<T>(path, { method: verb, body });
}
