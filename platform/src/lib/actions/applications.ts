"use server";

import { msg } from "@/i18n/config";
import { z } from "zod";
import { MAX_OPEN_APPLICATIONS, OPEN_APPLICATION_STAGES } from "@/lib/domain/fitCheck";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { approvalBlock } from "@/lib/domain/approval";
import { requireRole, CLIENT_ROLES } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";
import { notifyUser, NOTIFICATION_TYPES } from "@/lib/domain/notifications";
import { sendEmailSafely, getUserEmail } from "@/lib/email";
import { renderEmail, escapeHtml } from "@/lib/emailTemplate";
import { buildUnsubscribeUrl } from "@/lib/unsubscribeToken";
import type { FormState } from "./auth";
import { BULK_DECISION_LIMIT } from "@/lib/domain/decisions";

const PitchSchema = z.object({
  pitch: z.string().trim().min(30, msg("Tell them a bit more about why you're a fit — at least 30 characters.")),
});

// Anti-spam without a pay-to-apply model (Stage 5): a soft daily cap
// rather than a hard block on any single opportunity — a genuinely
// active job-seeker can still apply to several roles a day, but a script
// mass-applying to everything can't.
const MAX_APPLICATIONS_PER_DAY = 15;

const OPEN_CAP_MESSAGE = msg(
  "You already have 10 open applications. Withdraw one, or wait for an answer, before applying again — fewer, better applications get answered faster."
);

/** The talent's own open applications (Talent Charter cap). Staff-matched candidates don't count. */
async function countOpenApplications(supabase: Awaited<ReturnType<typeof createClient>>, talentId: string): Promise<number> {
  const { count } = await supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("talent_id", talentId)
    .eq("source", "applied")
    .in("stage", [...OPEN_APPLICATION_STAGES]);
  return count ?? 0;
}

/**
 * S08-02: saves a resumable draft — a separate table from `applications`
 * (application_drafts, 0078), so it's invisible to the employer and can't
 * collide with the real submission's uniqueness/deadline/status checks.
 * Silent no-op on failure by design: this fires from a "Save draft" click
 * mid-form, and a transient failure shouldn't block the applicant from
 * continuing to type or submitting for real.
 */
export async function saveApplicationDraft(
  opportunityId: string,
  pitch: string,
  answers: Record<string, string>
): Promise<{ error?: string }> {
  const session = await requireRole("talent");

  const supabase = await createClient();
  // An autosave can land just after the application was sent; never keep
  // a draft for something already applied to (it reopened at step 3).
  const { data: existing } = await supabase
    .from("applications")
    .select("id")
    .eq("opportunity_id", opportunityId)
    .eq("talent_id", session.userId)
    .limit(1);
  if (existing && existing.length > 0) {
    await supabase.from("application_drafts").delete().eq("opportunity_id", opportunityId).eq("talent_id", session.userId);
    return {};
  }
  const { error } = await supabase
    .from("application_drafts")
    .upsert({ opportunity_id: opportunityId, talent_id: session.userId, pitch, answers }, { onConflict: "opportunity_id,talent_id" });
  if (error) return { error: error.message };
  return {};
}

/**
 * Handles both the pitch and any screening-question answers in one submit.
 * Screening answers arrive as answer-{questionId} fields — the set of
 * questions is re-fetched server-side (never trusted from the form) so a
 * required question can't be dropped by tampering with the submission.
 */
export async function applyToOpportunity(
  opportunityId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireRole("talent");
  // 0128: new accounts wait for staff approval.
  const blocked = approvalBlock(session);
  if (blocked) return { message: blocked };

  const validated = PitchSchema.safeParse({ pitch: formData.get("pitch") });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recentCount } = await supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("talent_id", session.userId)
    .gte("created_at", since);
  if ((recentCount ?? 0) >= MAX_APPLICATIONS_PER_DAY) {
    return { message: `You've reached the daily limit of ${MAX_APPLICATIONS_PER_DAY} applications — try again tomorrow.` };
  }

  // Talent Charter: at most 10 open applications at once (0118 enforces
  // it too; this is the friendly message).
  if ((await countOpenApplications(supabase, session.userId)) >= MAX_OPEN_APPLICATIONS) {
    return { message: OPEN_CAP_MESSAGE };
  }

  // S08-04: the real enforcement is applications_insert RLS (0073), which
  // rejects this same insert server-side regardless of client — this is
  // just a friendlier message than a raw RLS-violation error, checked with
  // the same client the insert itself uses (never trust a value read
  // earlier on the page, which could be stale).
  const { data: opportunityCheck } = await supabase
    .from("opportunities")
    .select("status, application_deadline")
    .eq("id", opportunityId)
    .maybeSingle();
  if (!opportunityCheck || opportunityCheck.status !== "open") {
    return { message: msg("This opportunity is no longer accepting applications.") };
  }
  if (opportunityCheck.application_deadline && opportunityCheck.application_deadline < new Date().toISOString().slice(0, 10)) {
    return { message: msg("The application deadline for this opportunity has passed.") };
  }

  const { data: questions } = await supabase
    .from("screening_questions")
    .select("id, required")
    .eq("opportunity_id", opportunityId);

  const answers = (questions ?? []).map((q) => ({
    questionId: q.id,
    required: q.required,
    answer: (formData.get(`answer-${q.id}`) as string | null)?.trim() ?? "",
  }));

  const missing = answers.filter((a) => a.required && !a.answer);
  if (missing.length > 0) {
    const errors: Record<string, string[]> = {};
    for (const m of missing) errors[`answer-${m.questionId}`] = ["This question is required."];
    return { errors };
  }

  const { data: application, error } = await supabase
    .from("applications")
    .insert({
      opportunity_id: opportunityId,
      talent_id: session.userId,
      source: "applied",
      pitch: validated.data.pitch,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { message: msg("You've already applied to this opportunity.") };
    }
    if (error.message?.includes("open_application_cap")) return { message: OPEN_CAP_MESSAGE };
    return { message: error.message };
  }

  const answered = answers.filter((a) => a.answer);
  if (answered.length > 0) {
    await supabase.from("screening_answers").insert(
      answered.map((a) => ({
        application_id: application.id,
        screening_question_id: a.questionId,
        answer: a.answer,
      }))
    );
  }

  // S08-02: the draft's job is done once the real submission exists.
  await supabase.from("application_drafts").delete().eq("opportunity_id", opportunityId).eq("talent_id", session.userId);

  const admin = createAdminClient();
  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.APPLICATION_SUBMITTED,
    actorId: session.userId,
    entityType: "applications",
    entityId: application.id,
    source: "platform",
    metadata: { opportunityId },
  });

  redirect("/applications?applied=1");
}

/**
 * Employer moves their own application between submitted/shortlisted/
 * rejected on a self-service opportunity. RLS (0030's
 * applications_update_employer_self_service) is the real gate — this only
 * exists so the UI can call a typed action instead of a raw client update,
 * and to revalidate the page afterward. Staff-assisted opportunities and
 * every later stage (interviewing/offered/accepted/withdrawn) are
 * untouched by this policy, so this can't be used past the shortlist step.
 */
export async function setApplicationStage(
  applicationId: string,
  opportunityId: string,
  stage: "shortlisted" | "rejected",
  reason?: string
): Promise<{ error?: string }> {
  const session = await requireRole(...CLIENT_ROLES);

  const supabase = await createClient();
  const { data: application, error } = await supabase
    .from("applications")
    // S08-09: a manual reject previously left decision_reason untouched —
    // only the automatic closure-cascade path (0053/0054) ever set one, so
    // a manually rejected applicant got no explanation at all.
    .update(stage === "rejected" ? { stage, decision_reason: reason || null } : { stage })
    .eq("id", applicationId)
    .select("talent_id, opportunity_id")
    .single();
  if (error) return { error: error.message };
  // Trust the application's own opportunity, not the client-supplied id —
  // a stale or mismatched argument used to name the wrong job in the
  // talent's shortlist/rejection email.
  const actualOpportunityId = application.opportunity_id ?? opportunityId;

  const admin = createAdminClient();
  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.APPLICATION_STAGE_CHANGED,
    actorId: session.userId,
    entityType: "applications",
    entityId: applicationId,
    source: "platform",
    after: { stage },
    metadata: stage === "rejected" ? { reason: reason || null } : undefined,
  });
  await notifyUser(admin, {
    userId: application.talent_id,
    type: NOTIFICATION_TYPES.APPLICATION_STAGE_CHANGED,
    title: stage === "shortlisted" ? "You've been shortlisted" : "Application update",
    link: "/applications",
    dedupeKey: `${applicationId}:${stage}`,
  });

  // The in-app notification above only reaches someone who happens to
  // log back in — a decision is exactly the moment they're not already
  // sitting in the app, so both outcomes also need an email (same
  // fail-open contract as the notification itself: never blocks the
  // real stage change above if the send fails).
  const { data: opportunity } = await supabase.from("opportunities").select("title").eq("id", actualOpportunityId).single();
  const talentEmail = await getUserEmail(admin, application.talent_id);
  // S11-10: opportunity.title (employer-authored) and reason (employer's
  // free-text rejection note) both used to land straight in the HTML with
  // no escaping — an HTML-injection risk from either one. Both now go
  // through escapeHtml() before interpolation.
  const safeTitle = opportunity?.title ? escapeHtml(opportunity.title) : null;
  if (stage === "shortlisted") {
    await sendEmailSafely(
      talentEmail,
      "You've been shortlisted on AdorWorks",
      renderEmail({
        heading: "You've been shortlisted",
        paragraphs: [`Good news — you've been shortlisted for${safeTitle ? ` <strong>${safeTitle}</strong>` : " an opportunity"} on AdorWorks.`],
        ctaLabel: "View your applications",
        ctaUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/applications`,
        unsubscribeUrl: buildUnsubscribeUrl(application.talent_id),
      }),
      { admin, recipientUserId: application.talent_id }
    );
  } else {
    await sendEmailSafely(
      talentEmail,
      "An update on your AdorWorks application",
      renderEmail({
        heading: "An update on your application",
        paragraphs: [
          `Thanks for applying${safeTitle ? ` to <strong>${safeTitle}</strong>` : ""} on AdorWorks. The employer has decided not to move forward with your application this time.`,
          ...(reason ? [escapeHtml(reason)] : []),
        ],
        ctaLabel: "View your applications",
        ctaUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/applications`,
        unsubscribeUrl: buildUnsubscribeUrl(application.talent_id),
      }),
      { admin, recipientUserId: application.talent_id }
    );
  }

  revalidatePath(`/organisation/opportunities/${actualOpportunityId}`);
  return {};
}

const BulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(BULK_DECISION_LIMIT),
  opportunityId: z.string().uuid(),
  stage: z.enum(["shortlisted", "rejected"]),
  reason: z.string().trim().max(2000).optional(),
});

/**
 * Spec "one-tap shortlist and kind decline … bulk select works on up to
 * 50 applicants". Each applicant goes through setApplicationStage, so
 * RLS, the audit log, the notification and the email are exactly the
 * same as deciding one at a time. Only applications still 'submitted'
 * on this opportunity are touched, so a stale page can't decide twice.
 */
export async function bulkSetApplicationStage(input: {
  ids: string[];
  opportunityId: string;
  stage: "shortlisted" | "rejected";
  reason?: string;
}): Promise<{ done: number; skipped: number; failed: number; error?: string }> {
  await requireRole(...CLIENT_ROLES);
  const parsed = BulkSchema.safeParse({ ...input, ids: [...new Set(input.ids)] });
  if (!parsed.success) {
    return { done: 0, skipped: 0, failed: 0, error: `Choose between 1 and ${BULK_DECISION_LIMIT} applicants.` };
  }
  const { ids, opportunityId, stage, reason } = parsed.data;

  const supabase = await createClient();
  const { data: rows, error } = await supabase.from("applications").select("id, stage, opportunity_id").in("id", ids);
  if (error) return { done: 0, skipped: 0, failed: 0, error: error.message };
  const eligible = (rows ?? []).filter((r) => r.stage === "submitted" && r.opportunity_id === opportunityId).map((r) => r.id);

  let done = 0;
  let failed = 0;
  // A few at a time: each one also sends an email.
  for (let i = 0; i < eligible.length; i += 5) {
    const results = await Promise.all(eligible.slice(i, i + 5).map((id) => setApplicationStage(id, opportunityId, stage, reason)));
    for (const r of results) {
      if (r.error) failed += 1;
      else done += 1;
    }
  }
  revalidatePath(`/organisation/opportunities/${opportunityId}`);
  return { done, skipped: ids.length - eligible.length, failed };
}

/**
 * Stage 4: employer self-service talent search (0046) — an org member
 * adding a candidate they found themselves directly to their own
 * self-service opportunity's shortlist. source = 'matched' (same
 * provenance value staff already use for a non-self-initiated
 * application) and stage lands straight at 'shortlisted', not
 * 'submitted' — unlike the staff path, there's no reveal step to skip
 * since the employer is choosing this themselves. applications_insert's
 * RLS (0046) is what actually restricts this to the org's own
 * self-service opportunities; the unique(opportunity_id, talent_id)
 * constraint turns an accidental double-add into a friendly no-op error.
 */
export async function addCandidateToShortlist(opportunityId: string, talentId: string): Promise<{ error?: string }> {
  const session = await requireRole(...CLIENT_ROLES);

  const supabase = await createClient();
  const { data: application, error } = await supabase
    .from("applications")
    .insert({ opportunity_id: opportunityId, talent_id: talentId, source: "matched", stage: "shortlisted" })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: msg("Already added to this shortlist.") };
    return { error: error.message };
  }

  // S06-12: self-service candidate-access/shortlist-add was previously
  // unaudited entirely.
  const admin = createAdminClient();
  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.APPLICATION_STAGE_CHANGED,
    actorId: session.userId,
    subjectId: talentId,
    entityType: "applications",
    entityId: application.id,
    source: "platform",
    after: { stage: "shortlisted" },
    metadata: { reason: "employer_self_service_search" },
  });

  revalidatePath(`/organisation/opportunities/${opportunityId}`);
  revalidatePath(`/organisation/opportunities/${opportunityId}/find-talent`);
  return {};
}

/**
 * S06-10: removes a candidate the employer added themselves via
 * self-service search. applications_delete_employer_shortlist RLS (0074)
 * is the real gate — scoped to source='matched' rows only, so a real
 * applicant's own submission can never be deleted this way.
 */
export async function removeFromShortlist(applicationId: string, opportunityId: string): Promise<{ error?: string }> {
  const session = await requireRole(...CLIENT_ROLES);

  const supabase = await createClient();
  const { error } = await supabase.from("applications").delete().eq("id", applicationId);
  if (error) return { error: error.message };

  const admin = createAdminClient();
  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.APPLICATION_STAGE_CHANGED,
    actorId: session.userId,
    entityType: "applications",
    entityId: applicationId,
    source: "platform",
    after: { stage: "removed_from_shortlist" },
  });

  revalidatePath(`/organisation/opportunities/${opportunityId}`);
  revalidatePath(`/organisation/opportunities/${opportunityId}/find-talent`);
  return {};
}

/**
 * Stage 5: withdraw/reapply (0049). Plain client — applications_update_
 * talent_self (RLS) plus guard_applications_update_trigger are what
 * actually restrict this to the exact two self-service transitions
 * (submitted/shortlisted/interviewing -> withdrawn, withdrawn ->
 * submitted); this is just the typed entry point.
 */
export async function withdrawApplication(applicationId: string): Promise<{ error?: string }> {
  const session = await requireRole("talent");

  const supabase = await createClient();
  const { error } = await supabase.from("applications").update({ stage: "withdrawn" }).eq("id", applicationId);
  if (error) return { error: error.message };

  const admin = createAdminClient();
  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.APPLICATION_STAGE_CHANGED,
    actorId: session.userId,
    entityType: "applications",
    entityId: applicationId,
    source: "platform",
    after: { stage: "withdrawn" },
    metadata: { reason: "talent_withdrew" },
  });

  revalidatePath("/applications");
  return {};
}

export async function reapplyToOpportunity(applicationId: string): Promise<{ error?: string }> {
  const session = await requireRole("talent");

  const supabase = await createClient();
  if ((await countOpenApplications(supabase, session.userId)) >= MAX_OPEN_APPLICATIONS) {
    return { error: OPEN_CAP_MESSAGE };
  }
  const { error } = await supabase.from("applications").update({ stage: "submitted" }).eq("id", applicationId);
  if (error) return { error: error.message?.includes("open_application_cap") ? OPEN_CAP_MESSAGE : error.message };

  const admin = createAdminClient();
  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.APPLICATION_STAGE_CHANGED,
    actorId: session.userId,
    entityType: "applications",
    entityId: applicationId,
    source: "platform",
    after: { stage: "submitted" },
    metadata: { reason: "talent_reapplied" },
  });

  revalidatePath("/applications");
  return {};
}

/**
 * Stage 5: shared per-candidate notes for employer team collaboration
 * (0052) — append-only, visible to any org write-member of the
 * opportunity plus staff. Plain client; application_notes_insert's RLS
 * is the real gate. The 'viewer' pre-check here is a UX nicety, not the
 * security boundary — gap-check found requireRole(...CLIENT_ROLES) alone
 * lets a 'viewer' org member reach this action and get a raw wrapped
 * Postgres RLS error instead of a clean message, since 'viewer' is a
 * per-organisation_members role, a completely different axis from the
 * account-level roles CLIENT_ROLES checks.
 */
export async function addApplicationNote(
  applicationId: string,
  opportunityId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireRole(...CLIENT_ROLES);

  const body = String(formData.get("body") || "").trim();
  if (!body) {
    return { errors: { body: ["Write something before adding a note."] } };
  }

  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("organisation_members")
    .select("role")
    .eq("user_id", session.userId)
    .maybeSingle();
  if (membership?.role === "viewer") {
    return { message: msg("Viewers can't add notes.") };
  }

  const { error } = await supabase.from("application_notes").insert({
    application_id: applicationId,
    author_id: session.userId,
    body,
  });
  if (error) return { message: `Could not add this note: ${error.message}` };

  revalidatePath(`/organisation/opportunities/${opportunityId}`);
  return {};
}

/**
 * Stage 5: interview scheduling/notes (0051). Plain client;
 * applications_update_employer_interview's RLS scopes this to the
 * opportunity's own org, and guard_applications_update_trigger doesn't
 * restrict it further since `stage` itself is never touched here.
 */
export async function setInterviewDetails(
  applicationId: string,
  opportunityId: string,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await requireRole(...CLIENT_ROLES);

  const scheduledAt = (formData.get("interviewScheduledAt") as string | null) || null;
  const notes = (formData.get("interviewNotes") as string | null)?.trim() || null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("applications")
    .update({ interview_scheduled_at: scheduledAt, interview_notes: notes })
    .eq("id", applicationId);
  if (error) return { error: error.message };

  // S08-10/S08-12: interview-detail edits previously left no trace at all.
  const admin = createAdminClient();
  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.APPLICATION_STAGE_CHANGED,
    actorId: session.userId,
    entityType: "applications",
    entityId: applicationId,
    source: "platform",
    metadata: { reason: "interview_details_updated", interviewScheduledAt: scheduledAt },
  });

  revalidatePath(`/organisation/opportunities/${opportunityId}`);
  return {};
}
