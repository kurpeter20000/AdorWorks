"use server";

import { z } from "zod";
import { requireSession } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser, NOTIFICATION_TYPES } from "@/lib/domain/notifications";
import type { FormState } from "./auth";

const ReviewSchema = z.object({
  rating: z.coerce.number().int().min(1, "Choose a rating.").max(5),
  feedback: z.string().trim().max(2000).optional(),
});

/**
 * Either contract participant reviewing the other, once the contract is
 * completed. This is a direct client insert (no admin client) — unlike
 * the milestone/payment actions, RLS's reviews_insert policy (0013)
 * already enforces every rule that matters: contract must be
 * 'completed', reviewer_id must be the caller, and reviewer_role must
 * match which side of the contract the caller actually is on. There's
 * nothing left for this action to check that the database doesn't
 * already check more reliably.
 */
export async function submitReview(
  contractId: string,
  reviewerRole: "talent" | "employer",
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  await requireSession();

  const validated = ReviewSchema.safeParse({
    rating: formData.get("rating"),
    feedback: formData.get("feedback") || undefined,
  });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { message: "Your session has expired — please sign in again." };

  const { error } = await supabase.from("reviews").insert({
    contract_id: contractId,
    reviewer_id: user.id,
    reviewer_role: reviewerRole,
    rating: validated.data.rating,
    feedback: validated.data.feedback || null,
  });

  if (error) {
    if (error.code === "23505") {
      return { message: "You've already reviewed this contract." };
    }
    return { message: `Could not submit your review: ${error.message}` };
  }

  // S11-02: review submission had no user-facing notification at all —
  // the other party found out only by happening to open the contract.
  const admin = createAdminClient();
  const { data: contract } = await admin.from("contracts").select("talent_id, organisation_id").eq("id", contractId).maybeSingle();
  if (contract) {
    const { data: org } = await admin.from("organisations").select("representative_id").eq("id", contract.organisation_id).maybeSingle();
    const otherPartyId = reviewerRole === "talent" ? org?.representative_id : contract.talent_id;
    if (otherPartyId) {
      await notifyUser(admin, {
        userId: otherPartyId,
        type: NOTIFICATION_TYPES.REVIEW_RECEIVED,
        title: "You received a review on AdorWorks",
        link: `/contracts/${contractId}`,
        // reviews' own unique index on (contract_id, reviewer_id) already
        // guarantees one review per reviewer per contract.
        dedupeKey: `${contractId}:${reviewerRole}`,
      });
    }
  }

  return {};
}
