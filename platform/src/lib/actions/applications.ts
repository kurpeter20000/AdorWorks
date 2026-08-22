"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";

/**
 * A talent applying to a public, open opportunity. This is the one
 * self-service write on the applications table RLS actually allows
 * directly (applications_insert: talent_id = auth.uid() and
 * source = 'applied') — no admin client needed, no business rule beyond
 * what RLS already enforces. Every later stage change (shortlisted,
 * offered, etc.) is staff-only, done from the staff console.
 */
export async function applyToOpportunity(opportunityId: string): Promise<{ error?: string }> {
  const session = await requireRole("talent");
  const supabase = await createClient();

  const { error } = await supabase.from("applications").insert({
    opportunity_id: opportunityId,
    talent_id: session.userId,
    source: "applied",
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "You've already applied to this opportunity." };
    }
    return { error: error.message };
  }

  revalidatePath("/opportunities");
  revalidatePath("/applications");
  return {};
}
