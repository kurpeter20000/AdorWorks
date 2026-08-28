"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole, CLIENT_ROLES } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";
import { notifyUser, NOTIFICATION_TYPES } from "@/lib/domain/notifications";
import type { FormState } from "./auth";

const PitchSchema = z.object({
  pitch: z.string().trim().min(30, "Tell them a bit more about why you're a fit — at least 30 characters."),
});

// Anti-spam without a pay-to-apply model (Stage 5): a soft daily cap
// rather than a hard block on any single opportunity — a genuinely
// active job-seeker can still apply to several roles a day, but a script
// mass-applying to everything can't.
const MAX_APPLICATIONS_PER_DAY = 15;

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
      return { message: "You've already applied to this opportunity." };
    }
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
  stage: "shortlisted" | "rejected"
): Promise<{ error?: string }> {
  const session = await requireRole(...CLIENT_ROLES);

  const supabase = await createClient();
  const { data: application, error } = await supabase
    .from("applications")
    .update({ stage })
    .eq("id", applicationId)
    .select("talent_id")
    .single();
  if (error) return { error: error.message };

  const admin = createAdminClient();
  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.APPLICATION_STAGE_CHANGED,
    actorId: session.userId,
    entityType: "applications",
    entityId: applicationId,
    source: "platform",
    after: { stage },
  });
  await notifyUser(admin, {
    userId: application.talent_id,
    type: NOTIFICATION_TYPES.APPLICATION_STAGE_CHANGED,
    title: stage === "shortlisted" ? "You've been shortlisted" : "Application update",
    link: "/applications",
  });

  revalidatePath(`/organisation/opportunities/${opportunityId}`);
  return {};
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
  await requireRole(...CLIENT_ROLES);

  const supabase = await createClient();
  const { error } = await supabase
    .from("applications")
    .insert({ opportunity_id: opportunityId, talent_id: talentId, source: "matched", stage: "shortlisted" });
  if (error) {
    if (error.code === "23505") return { error: "Already added to this shortlist." };
    return { error: error.message };
  }

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
  await requireRole("talent");

  const supabase = await createClient();
  const { error } = await supabase.from("applications").update({ stage: "submitted" }).eq("id", applicationId);
  if (error) return { error: error.message };

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
    return { message: "Viewers can't add notes." };
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
  await requireRole(...CLIENT_ROLES);

  const scheduledAt = (formData.get("interviewScheduledAt") as string | null) || null;
  const notes = (formData.get("interviewNotes") as string | null)?.trim() || null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("applications")
    .update({ interview_scheduled_at: scheduledAt, interview_notes: notes })
    .eq("id", applicationId);
  if (error) return { error: error.message };

  revalidatePath(`/organisation/opportunities/${opportunityId}`);
  return {};
}
