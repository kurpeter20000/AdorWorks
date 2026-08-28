"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole, CLIENT_ROLES } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { SCORECARD_CRITERIA } from "@/lib/domain/scorecard";

const ScoreSchema = z.object({
  criterion: z.enum(SCORECARD_CRITERIA),
  score: z.coerce.number().int().min(1).max(5),
  note: z.string().trim().max(500).optional(),
});

/**
 * Stage 5: structured scorecards (0051) — one reviewer's score for one
 * fixed criterion on one application. upsert on the (application_id,
 * criterion, scored_by) unique constraint so re-scoring the same
 * criterion replaces this reviewer's own prior score rather than adding
 * a duplicate row; other reviewers' scores for the same criterion are
 * untouched, which is the whole point (comparable, multi-reviewer input).
 */
export async function submitScorecardScore(
  applicationId: string,
  opportunityId: string,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await requireRole(...CLIENT_ROLES);

  const validated = ScoreSchema.safeParse({
    criterion: formData.get("criterion"),
    score: formData.get("score"),
    note: formData.get("note") || undefined,
  });
  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? "Invalid score." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("application_scorecards").upsert(
    {
      application_id: applicationId,
      criterion: validated.data.criterion,
      score: validated.data.score,
      note: validated.data.note || null,
      scored_by: session.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "application_id,criterion,scored_by" }
  );
  if (error) return { error: error.message };

  revalidatePath(`/organisation/opportunities/${opportunityId}`);
  revalidatePath(`/organisation/opportunities/${opportunityId}/compare`);
  return {};
}
