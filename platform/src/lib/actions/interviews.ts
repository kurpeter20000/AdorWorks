"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSession } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";
import { sendEmailSafely, getUserEmail } from "@/lib/email";
import { renderEmail } from "@/lib/emailTemplate";
import { buildUnsubscribeUrl } from "@/lib/unsubscribeToken";

const SlotSchema = z.object({
  starts_at: z.string().datetime({ offset: true }),
  duration_minutes: z.number().int().min(10).max(240).default(30),
  mode: z.enum(["video", "phone", "in_person"]).default("video"),
  details: z.string().trim().max(500).optional(),
});
const SlotsSchema = z.array(SlotSchema).min(1).max(5);

export type SlotInput = z.input<typeof SlotSchema>;

/**
 * Spec "Interview scheduling": the employer (or staff, on staff-assisted
 * roles) offers 1–5 times; a new set replaces any unanswered one. The
 * database checks who may schedule and that times are in the future
 * (0113); it also notifies the talent in the app — this adds an email.
 */
export async function offerInterviewSlots(applicationId: string, slots: SlotInput[]): Promise<{ error?: string }> {
  const session = await requireSession();
  const parsed = SlotsSchema.safeParse(slots);
  if (!parsed.success) return { error: "Offer between 1 and 5 times, each with a date and time." };

  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { error } = await supabase.rpc("offer_interview_slots", { p_application_id: applicationId, p_slots: parsed.data });
  if (error) return { error: error.message };

  const admin = createAdminClient();
  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.INTERVIEW_TIMES_OFFERED,
    actorId: session.userId,
    entityType: "applications",
    entityId: applicationId,
    source: "platform",
    metadata: { count: parsed.data.length },
  });
  const { data: app } = await admin.from("applications").select("talent_id, opportunity_id").eq("id", applicationId).maybeSingle();
  if (app) {
    await sendEmailSafely(
      await getUserEmail(admin, app.talent_id),
      "Pick a time for your AdorWorks interview",
      renderEmail({
        heading: "Pick a time for your interview",
        paragraphs: [`The employer offered ${parsed.data.length === 1 ? "a time" : `${parsed.data.length} times`} for an interview. Pick the one that suits you — you'll see them in your own timezone.`],
        ctaLabel: "Pick a time",
        ctaUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/applications`,
        unsubscribeUrl: buildUnsubscribeUrl(app.talent_id),
      }),
      { admin, recipientUserId: app.talent_id }
    );
    revalidatePath(`/organisation/opportunities/${app.opportunity_id}`);
  }
  revalidatePath("/operations/opportunities");
  return {};
}

/** The talent picks one of the offered times; the application moves to the interview stage (0113). */
export async function chooseInterviewSlot(slotId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { data, error } = await supabase.rpc("choose_interview_slot", { p_slot_id: slotId });
  if (error) return { error: error.message };
  await logAuditEvent(createAdminClient(), {
    name: DOMAIN_EVENTS.INTERVIEW_TIME_CHOSEN,
    actorId: session.userId,
    entityType: "applications",
    entityId: data?.application_id ?? slotId,
    source: "platform",
    metadata: { slotId, startsAt: data?.starts_at },
  });
  revalidatePath("/applications");
  revalidatePath("/dashboard");
  return {};
}
