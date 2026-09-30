"use server";

import { requireRole, STAFF_ROLES } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";

// The private buckets staff review files from (same ones the old
// console opened with the signed-in staff member's own client; storage
// RLS decides whether this person may read the object).
const STAFF_READABLE_BUCKETS = new Set(["talent-evidence", "talent-videos", "org-documents"]);

export async function signedStaffFileUrl(
  bucket: string,
  path: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requireRole(...STAFF_ROLES);
  if (!STAFF_READABLE_BUCKETS.has(bucket) || !path || path.includes("..")) {
    return { ok: false, error: "That file can't be opened here." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
  if (error || !data) return { ok: false, error: `Could not open the file: ${error?.message ?? "unknown error"}` };
  return { ok: true, url: data.signedUrl };
}
