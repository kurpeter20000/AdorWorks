import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * The next receipt number, AW-2026-000123 (0116's next_receipt_number(),
 * one sequence for payments in and payouts alike).
 *
 * Never fails: if the sequence can't be reached (migration not yet run,
 * network blip) this falls back to the old date-and-id format, because a
 * payment that has already gone through must still get recorded with
 * some receipt number rather than be lost over a numbering hiccup.
 */
export async function nextReceiptNumber(admin: ReturnType<typeof createAdminClient>, fallbackId: string): Promise<string> {
  try {
    const { data, error } = await admin.rpc("next_receipt_number");
    if (!error && typeof data === "string" && data) return data;
    if (error) console.error("[receipts] next_receipt_number failed, using fallback:", error.message);
  } catch (e) {
    console.error("[receipts] next_receipt_number threw, using fallback:", e);
  }
  return `RCPT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${fallbackId.slice(0, 8).toUpperCase()}`;
}
