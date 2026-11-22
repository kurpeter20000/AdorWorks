"use server";

import { revalidatePath } from "next/cache";
import { msg } from "@/i18n/config";
import { requireRole, CLIENT_ROLES } from "@/lib/dal/session";
import { OPPORTUNITY_REVIEW_ROLES } from "@/lib/domain/staffAccess";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";
import { notifyUser, NOTIFICATION_TYPES } from "@/lib/domain/notifications";
import { FEATURE_DAY_OPTIONS } from "@/lib/domain/featured";

export type FeatureResult = { ok?: boolean; error?: string };

function revalidate(opportunityId: string) {
  revalidatePath("/operations/opportunities");
  revalidatePath(`/organisation/opportunities/${opportunityId}`);
  revalidatePath("/opportunities");
}

/**
 * The employer asks for their job to be featured (0126). Featuring is
 * paid: staff contact them with the price and payment details, then
 * switch it on. RLS limits this update to the organisation's own people.
 */
export async function requestFeaturing(opportunityId: string): Promise<FeatureResult> {
  const session = await requireRole(...CLIENT_ROLES);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .update({ featured_requested_at: new Date().toISOString() })
    .eq("id", opportunityId)
    .in("status", ["open", "pending_review"])
    .select("id");
  if (error || !data || data.length === 0) return { error: msg("Couldn't send your request — only live or in-review jobs can be featured.") };
  await logAuditEvent(createAdminClient(), {
    name: DOMAIN_EVENTS.OPPORTUNITY_FEATURE_REQUESTED,
    actorId: session.userId,
    entityType: "opportunities",
    entityId: opportunityId,
    source: "platform",
  });
  revalidate(opportunityId);
  return { ok: true };
}

/** Staff switch featuring on for a number of days, once payment is confirmed. */
export async function featureOpportunity(opportunityId: string, days: number, paymentNote: string): Promise<FeatureResult> {
  const session = await requireRole(...OPPORTUNITY_REVIEW_ROLES);
  if (!(FEATURE_DAY_OPTIONS as readonly number[]).includes(days)) return { error: "Choose 7, 14 or 30 days." };
  const note = paymentNote.trim().slice(0, 300);
  if (note.length < 3) return { error: "Add the payment reference (or why it's free) so finance can match it." };

  const supabase = await createClient();
  const { data: row } = await supabase.from("opportunities").select("id, title, status, organisation_id, featured_until").eq("id", opportunityId).maybeSingle();
  if (!row) return { error: "Opportunity not found." };
  if (row.status !== "open") return { error: "Only open jobs can be featured." };

  // Extending a running feature adds to its end date.
  const start = row.featured_until && new Date(row.featured_until) > new Date() ? new Date(row.featured_until) : new Date();
  const until = new Date(start.getTime() + days * 86400000).toISOString();
  const { error } = await supabase
    .from("opportunities")
    .update({ featured_until: until, featured_by: session.userId, featured_requested_at: null })
    .eq("id", opportunityId);
  if (error) return { error: `Could not feature this job: ${error.message}` };

  const admin = createAdminClient();
  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.OPPORTUNITY_FEATURED,
    actorId: session.userId,
    entityType: "opportunities",
    entityId: opportunityId,
    source: "platform",
    reason: note,
    after: { featured_until: until, days },
  });
  const { data: org } = await admin.from("organisations").select("representative_id").eq("id", row.organisation_id).maybeSingle();
  if (org?.representative_id) {
    const end = new Date(until).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    await notifyUser(admin, {
      userId: org.representative_id,
      type: NOTIFICATION_TYPES.OPPORTUNITY_FEATURED,
      title: "Your job is featured",
      body: `"${row.title}" now shows at the top of the jobs list until ${end}.`,
      link: `/organisation/opportunities/${opportunityId}`,
    });
  }
  revalidate(opportunityId);
  return { ok: true };
}

/** Staff stop featuring early (or clear a request they've handled). */
export async function unfeatureOpportunity(opportunityId: string, reason: string): Promise<FeatureResult> {
  const session = await requireRole(...OPPORTUNITY_REVIEW_ROLES);
  const supabase = await createClient();
  const { error } = await supabase
    .from("opportunities")
    .update({ featured_until: null, featured_by: session.userId, featured_requested_at: null })
    .eq("id", opportunityId);
  if (error) return { error: `Could not change this job: ${error.message}` };
  await logAuditEvent(createAdminClient(), {
    name: DOMAIN_EVENTS.OPPORTUNITY_UNFEATURED,
    actorId: session.userId,
    entityType: "opportunities",
    entityId: opportunityId,
    source: "platform",
    reason: reason.trim().slice(0, 300) || null,
  });
  revalidate(opportunityId);
  return { ok: true };
}
