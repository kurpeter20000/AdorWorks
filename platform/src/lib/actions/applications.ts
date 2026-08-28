"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole, CLIENT_ROLES } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./auth";

const PitchSchema = z.object({
  pitch: z.string().trim().min(30, "Tell them a bit more about why you're a fit — at least 30 characters."),
});

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
  await requireRole(...CLIENT_ROLES);

  const supabase = await createClient();
  const { error } = await supabase.from("applications").update({ stage }).eq("id", applicationId);
  if (error) return { error: error.message };

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
