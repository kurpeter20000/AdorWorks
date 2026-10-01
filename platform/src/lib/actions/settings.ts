"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";
import { getFeeRates } from "@/lib/dal/settings";
import { MAX_FEE_PERCENT } from "@/lib/domain/fees";
import type { FormState } from "./auth";

const FeeSchema = z.object({
  enabled: z.boolean(),
  employerPercent: z.coerce.number().min(0, "Can't be negative.").max(MAX_FEE_PERCENT, `At most ${MAX_FEE_PERCENT}%.`),
  talentPercent: z.coerce.number().min(0, "Can't be negative.").max(MAX_FEE_PERCENT, `At most ${MAX_FEE_PERCENT}%.`),
  reason: z.string().trim().min(10, "Say why this is changing (at least 10 characters) — it goes in the audit log."),
});

/**
 * Finance/admin only. Changes apply to payments made from now on; every
 * past payment keeps the rate stamped on it at the time (0096).
 */
export async function updateFeeSettings(_prev: FormState, formData: FormData): Promise<FormState & { saved?: boolean }> {
  const session = await requireRole("finance", "admin");
  const parsed = FeeSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    employerPercent: formData.get("employerPercent"),
    talentPercent: formData.get("talentPercent"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const v = parsed.data;

  const before = await getFeeRates();
  const value = { enabled: v.enabled, employer_percent: v.employerPercent, talent_percent: v.talentPercent };
  const admin = createAdminClient();
  const { error } = await admin
    .from("platform_settings")
    .upsert({ key: "fees", value, updated_by: session.userId, updated_at: new Date().toISOString() });
  if (error) return { message: `Could not save: ${error.message}` };

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.PLATFORM_SETTINGS_CHANGED,
    actorId: session.userId,
    entityType: "platform_settings",
    entityId: "fees",
    source: "platform",
    reason: v.reason,
    before: { enabled: before.enabled, employer_percent: before.employerPercent, talent_percent: before.talentPercent },
    after: value,
  });
  revalidatePath("/operations/settings");
  return { saved: true };
}
