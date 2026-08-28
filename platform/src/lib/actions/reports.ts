"use server";

import { z } from "zod";
import { requireSession } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import type { ReportTargetType } from "@/lib/database.types";
import type { FormState } from "./auth";

/**
 * Stage 4: reporting a listing/profile as abusive or spam (0047). Open to
 * anyone signed in — a report about someone else's content doesn't need
 * a specific role, just a real account (reports_insert's RLS check
 * mirrors this: reporter_id = auth.uid(), no role restriction).
 */

const ReportSchema = z.object({
  reason: z.enum(["spam", "scam", "inappropriate", "misleading", "other"], { message: "Choose a reason." }),
  note: z.string().trim().max(1000).optional(),
});

export async function fileReport(
  targetType: ReportTargetType,
  targetId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState & { success?: boolean }> {
  const session = await requireSession();

  const validated = ReportSchema.safeParse({
    reason: formData.get("reason"),
    note: formData.get("note") || undefined,
  });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("reports").insert({
    reporter_id: session.userId,
    target_type: targetType,
    target_id: targetId,
    reason: validated.data.reason,
    note: validated.data.note || null,
  });
  if (error) return { message: `Could not submit this report: ${error.message}` };

  return { success: true };
}
