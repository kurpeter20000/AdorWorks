"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole, CLIENT_ROLES } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { staffAreaRoles } from "@/lib/domain/staffAccess";
import { notifyUser, NOTIFICATION_TYPES } from "@/lib/domain/notifications";
import { sendEmailSafely, getUserEmail } from "@/lib/email";
import { renderEmail, escapeHtml } from "@/lib/emailTemplate";
import { buildUnsubscribeUrl } from "@/lib/unsubscribeToken";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";
import { KIND_DECLINE } from "@/lib/domain/decisions";
import { msg } from "@/i18n/config";

/**
 * Shortlist builder and employer shortlist review (0119, competitive
 * brief). Staff add verified candidates (opportunities console), write a
 * reviewer note for each, and send the shortlist; the employer reviews
 * them side by side and decides per candidate, or asks for more.
 * Every shortlist is human-reviewed: nothing here is automatic.
 */

type Admin = ReturnType<typeof createAdminClient>;

/** Spec: "3–5 candidates side by side". Fewer is allowed (a niche role), more is not. */
const SHORTLIST_MAX = 5;

const NoteSchema = z.string().trim().min(10, "Write at least a sentence on why this person fits.").max(600);

/** Staff: the note the employer sees on this candidate. */
export async function saveReviewerNote(applicationId: string, note: string): Promise<{ error?: string }> {
  const session = await requireRole(...staffAreaRoles("opportunities"));
  const parsed = NoteSchema.safeParse(note);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const admin = createAdminClient();
  const { data, error } = await admin.from("applications").update({ reviewer_note: parsed.data }).eq("id", applicationId).select("opportunity_id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Candidate not found." };
  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.APPLICATION_STAGE_CHANGED,
    actorId: session.userId,
    entityType: "applications",
    entityId: applicationId,
    source: "platform",
    metadata: { reason: "reviewer_note_saved" },
  });
  return {};
}

/**
 * Staff: sends every staff-added candidate still waiting ('submitted',
 * source 'matched') to the employer. Each must have a reviewer note.
 */
export async function sendShortlist(opportunityId: string): Promise<{ error?: string; sent?: number }> {
  const session = await requireRole(...staffAreaRoles("opportunities"));
  const admin = createAdminClient();

  const { data: opportunity } = await admin.from("opportunities").select("id, title, organisation_id").eq("id", opportunityId).maybeSingle();
  if (!opportunity) return { error: "Opportunity not found." };

  const { data: waiting, error: readError } = await admin
    .from("applications")
    .select("id, talent_id, reviewer_note")
    .eq("opportunity_id", opportunityId)
    .eq("source", "matched")
    .eq("stage", "submitted");
  if (readError) return { error: readError.message };
  if (!waiting?.length) return { error: "Add candidates first — there's no one waiting to be sent." };
  const withoutNote = waiting.filter((a) => !a.reviewer_note?.trim());
  if (withoutNote.length > 0) {
    return { error: `Write a reviewer note for every candidate first (${withoutNote.length} missing).` };
  }
  const { count: alreadyShown } = await admin
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("opportunity_id", opportunityId)
    .eq("source", "matched")
    .in("stage", ["shortlisted", "interviewing"]);
  if ((alreadyShown ?? 0) + waiting.length > SHORTLIST_MAX) {
    return { error: `A shortlist is at most ${SHORTLIST_MAX} candidates under review at once — remove some first.` };
  }

  const ids = waiting.map((a) => a.id);
  // Only rows still 'submitted' move, so a double click sends once.
  const { data: moved, error } = await admin
    .from("applications")
    .update({ stage: "shortlisted" })
    .in("id", ids)
    .eq("stage", "submitted")
    .select("id, talent_id");
  if (error) return { error: error.message };
  if (!moved?.length) return { error: "This shortlist was just sent. Refresh the page." };

  await admin
    .from("opportunities")
    .update({ shortlist_sent_at: new Date().toISOString(), more_candidates_requested_at: null, more_candidates_note: null })
    .eq("id", opportunityId);
  // 0120: the staff member who sends the first shortlist becomes the
  // employer's named account contact (staff can take it over later).
  await admin.from("opportunities").update({ account_contact_id: session.userId }).eq("id", opportunityId).is("account_contact_id", null);

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.SHORTLIST_SENT,
    actorId: session.userId,
    entityType: "opportunities",
    entityId: opportunityId,
    source: "platform",
    after: { stage: "shortlisted", count: moved.length },
    metadata: { reason: "shortlist_sent", applicationIds: moved.map((m) => m.id) },
  });

  await notifyEmployer(admin, opportunity, moved.length);
  for (const m of moved) {
    await notifyUser(admin, {
      userId: m.talent_id,
      type: NOTIFICATION_TYPES.APPLICATION_STAGE_CHANGED,
      title: "You've been shortlisted",
      body: `AdorWorks recommended you for "${opportunity.title}". The employer is reviewing the shortlist now.`,
      link: "/applications",
      dedupeKey: `${m.id}:shortlisted`,
    });
  }

  revalidatePath(`/organisation/opportunities/${opportunityId}`);
  return { sent: moved.length };
}

async function notifyEmployer(admin: Admin, opportunity: { id: string; title: string; organisation_id: string }, count: number) {
  const { data: org } = await admin.from("organisations").select("representative_id").eq("id", opportunity.organisation_id).maybeSingle();
  if (!org?.representative_id) return;
  const title = "Your shortlist is ready";
  const body = `AdorWorks has sent ${count} reviewed candidate${count === 1 ? "" : "s"} for "${opportunity.title}". Compare them side by side and decide.`;
  const link = `/organisation/opportunities/${opportunity.id}#shortlist-review`;
  await notifyUser(admin, { userId: org.representative_id, type: NOTIFICATION_TYPES.SHORTLIST_READY, title, body, link, dedupeKey: `${opportunity.id}:${new Date().toISOString().slice(0, 13)}` });
  const email = await getUserEmail(admin, org.representative_id);
  await sendEmailSafely(
    email,
    `${title} — AdorWorks`,
    renderEmail({
      heading: title,
      paragraphs: [escapeHtml(body)],
      ctaLabel: "Review the shortlist",
      ctaUrl: `${process.env.NEXT_PUBLIC_SITE_URL}${link}`,
      unsubscribeUrl: buildUnsubscribeUrl(org.representative_id),
    }),
    { admin, recipientUserId: org.representative_id }
  );
}

/** The employer (any org member who can act, not a viewer) for this opportunity, or an error. */
async function requireOpportunityDecider(admin: Admin, userId: string, opportunityId: string) {
  const { data: opportunity } = await admin.from("opportunities").select("id, title, organisation_id").eq("id", opportunityId).maybeSingle();
  if (!opportunity) return { error: msg("Opportunity not found.") } as const;
  const { data: member } = await admin
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", opportunity.organisation_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member || member.role === "viewer") return { error: msg("You don't have permission to decide on this shortlist.") } as const;
  return { opportunity } as const;
}

const DecisionSchema = z.object({
  decision: z.enum(["interview", "decline"]),
  note: z.string().trim().max(2000).optional(),
});

/** Employer: per candidate on a staff-built shortlist — move to interview, or a kind decline. */
export async function respondToShortlist(applicationId: string, decision: "interview" | "decline", note?: string): Promise<{ error?: string }> {
  const session = await requireRole(...CLIENT_ROLES);
  const parsed = DecisionSchema.safeParse({ decision, note });
  if (!parsed.success) return { error: msg("Choose interview or decline.") };
  const admin = createAdminClient();

  const { data: application } = await admin
    .from("applications")
    .select("id, opportunity_id, talent_id, stage, source")
    .eq("id", applicationId)
    .maybeSingle();
  if (!application) return { error: msg("Candidate not found.") };
  const gate = await requireOpportunityDecider(admin, session.userId, application.opportunity_id);
  if ("error" in gate) return { error: gate.error };
  if (application.stage !== "shortlisted") return { error: msg("You've already decided on this candidate. Refresh the page.") };

  const reason = parsed.data.decision === "decline" ? parsed.data.note || KIND_DECLINE : null;
  const next = parsed.data.decision === "interview" ? "interviewing" : "rejected";
  const { data: updated, error } = await admin
    .from("applications")
    .update(next === "rejected" ? { stage: next, decision_reason: reason } : { stage: next })
    .eq("id", applicationId)
    .eq("stage", "shortlisted")
    .select("id");
  if (error) return { error: error.message };
  if (!updated?.length) return { error: msg("You've already decided on this candidate. Refresh the page.") };

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.APPLICATION_STAGE_CHANGED,
    actorId: session.userId,
    subjectId: application.talent_id,
    entityType: "applications",
    entityId: applicationId,
    source: "platform",
    before: { stage: "shortlisted" },
    after: { stage: next },
    metadata: { reason: next === "rejected" ? reason : "employer_shortlist_review" },
  });

  const safeTitle = escapeHtml(gate.opportunity.title);
  const title = next === "interviewing" ? "The employer wants to interview you" : "Application update";
  const body =
    next === "interviewing"
      ? `Good news — the employer for "${gate.opportunity.title}" would like to interview you. AdorWorks will be in touch to arrange a time.`
      : `The employer for "${gate.opportunity.title}" has decided not to move forward this time. ${reason}`;
  await notifyUser(admin, { userId: application.talent_id, type: NOTIFICATION_TYPES.APPLICATION_STAGE_CHANGED, title, body, link: "/applications", dedupeKey: `${applicationId}:${next}` });
  const email = await getUserEmail(admin, application.talent_id);
  await sendEmailSafely(
    email,
    `${title} — AdorWorks`,
    renderEmail({
      heading: title,
      paragraphs:
        next === "interviewing"
          ? [`Good news — the employer for <strong>${safeTitle}</strong> would like to interview you. AdorWorks will be in touch to arrange a time.`]
          : [`Thank you for being part of the shortlist for <strong>${safeTitle}</strong>. The employer has decided not to move forward this time.`, escapeHtml(reason ?? "")],
      ctaLabel: "View your applications",
      ctaUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/applications`,
      unsubscribeUrl: buildUnsubscribeUrl(application.talent_id),
    }),
    { admin, recipientUserId: application.talent_id }
  );

  revalidatePath(`/organisation/opportunities/${application.opportunity_id}`);
  return {};
}

const MoreSchema = z.string().trim().max(1000);

/** Employer: none of these fit — ask AdorWorks for more candidates, optionally saying what's missing. */
export async function requestMoreCandidates(opportunityId: string, note: string): Promise<{ error?: string }> {
  const session = await requireRole(...CLIENT_ROLES);
  const parsed = MoreSchema.safeParse(note ?? "");
  if (!parsed.success) return { error: msg("Keep the note under 1,000 characters.") };
  const admin = createAdminClient();
  const gate = await requireOpportunityDecider(admin, session.userId, opportunityId);
  if ("error" in gate) return { error: gate.error };

  const { error } = await admin
    .from("opportunities")
    .update({ more_candidates_requested_at: new Date().toISOString(), more_candidates_note: parsed.data || null })
    .eq("id", opportunityId);
  if (error) return { error: error.message };

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.MORE_CANDIDATES_REQUESTED,
    actorId: session.userId,
    entityType: "opportunities",
    entityId: opportunityId,
    source: "platform",
    metadata: { reason: "more_candidates_requested", note: parsed.data || null },
  });
  revalidatePath(`/organisation/opportunities/${opportunityId}`);
  return {};
}

/**
 * First-job boost (0121): AdorVerified (or higher) talent with no
 * employer reviews yet, who haven't had their boost this month, ranked by
 * skill overlap with the opportunity (never by pay) then newest first.
 * Staff pick one to give a shortlist slot.
 */
export async function listFirstJobCandidates(
  opportunityId: string
): Promise<{ error?: string; candidates?: { talentId: string; name: string; headline: string | null; tier: string; matches: string[] }[] }> {
  await requireRole(...staffAreaRoles("opportunities"));
  const admin = createAdminClient();
  const { data: opportunity } = await admin.from("opportunities").select("skills, category").eq("id", opportunityId).maybeSingle();
  if (!opportunity) return { error: "Opportunity not found." };

  let q = admin
    .from("talent_profiles")
    .select("id, display_name, headline, verification_tier, skills, created_at")
    .in("verification_tier", ["adorverified", "adorcertified", "team_lead"])
    .order("created_at", { ascending: false })
    .limit(200);
  if (opportunity.category) q = q.eq("category", opportunity.category);
  const { data: pool, error } = await q;
  if (error) return { error: error.message };
  const ids = (pool ?? []).map((p) => p.id);
  if (ids.length === 0) return { candidates: [] };

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { data: poolContracts } = await admin.from("contracts").select("id, talent_id").in("talent_id", ids);
  const contractIds = (poolContracts ?? []).map((c) => c.id);
  const { data: employerReviews } = contractIds.length
    ? await admin.from("reviews").select("contract_id").in("contract_id", contractIds).eq("reviewer_role", "employer")
    : { data: [] as { contract_id: string | null }[] };
  const reviewedContracts = new Set((employerReviews ?? []).map((r) => r.contract_id));
  const reviewed = (poolContracts ?? []).filter((c) => reviewedContracts.has(c.id));
  const [{ data: boosted }, { data: already }] = await Promise.all([
    admin.from("applications").select("talent_id").in("talent_id", ids).eq("first_job_boost", true).gte("created_at", monthStart.toISOString()),
    admin.from("applications").select("talent_id").eq("opportunity_id", opportunityId),
  ]);
  const exclude = new Set([...reviewed, ...(boosted ?? []), ...(already ?? [])].map((r) => r.talent_id));
  const asked = (opportunity.skills ?? []).map((s: string) => s.toLowerCase());

  const candidates = (pool ?? [])
    .filter((p) => !exclude.has(p.id))
    .map((p) => ({
      talentId: p.id,
      name: p.display_name ?? "AdorWorks talent",
      headline: p.headline,
      tier: p.verification_tier,
      matches: (p.skills ?? []).filter((s: string) => asked.includes(s.toLowerCase())),
      created_at: p.created_at,
    }))
    .filter((c) => asked.length === 0 || c.matches.length > 0)
    .sort((a, b) => b.matches.length - a.matches.length || +new Date(b.created_at) - +new Date(a.created_at))
    .slice(0, 5)
    .map((c) => ({ talentId: c.talentId, name: c.name, headline: c.headline, tier: c.tier, matches: c.matches }));
  return { candidates };
}

/** Staff: add a first-job candidate to the shortlist, using their boost for this month. */
export async function addFirstJobCandidate(opportunityId: string, talentId: string): Promise<{ error?: string }> {
  const session = await requireRole(...staffAreaRoles("opportunities"));
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("applications")
    .insert({ opportunity_id: opportunityId, talent_id: talentId, source: "matched", stage: "submitted", first_job_boost: true, created_by: session.userId })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "This person is already on this opportunity." };
    if (error.message?.includes("first_job_boost:")) return { error: error.message.split("first_job_boost:")[1].trim() };
    return { error: error.message };
  }
  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.APPLICATION_STAGE_CHANGED,
    actorId: session.userId,
    subjectId: talentId,
    entityType: "applications",
    entityId: data.id,
    source: "platform",
    after: { stage: "submitted" },
    metadata: { reason: "first_job_boost", opportunityId },
  });
  return {};
}
