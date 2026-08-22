import { redirect } from "next/navigation";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Entry point: figures out where in the flow this talent user actually
 * is and sends them straight there, rather than making them click
 * through completed steps again — this is the "resumable" half of
 * "resumable, per-step onboarding" (spec requirement).
 */
export default async function OnboardingEntryPage() {
  const session = await requireRole("talent");
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("talent_profiles")
    .select("headline")
    .eq("id", session.userId)
    .maybeSingle();

  if (!profile || !profile.headline) {
    redirect("/onboarding/basics");
  }

  const { data: evidence } = await supabase
    .from("talent_evidence")
    .select("id")
    .eq("talent_id", session.userId)
    .eq("evidence_type", "identity")
    .limit(1)
    .maybeSingle();

  if (!evidence) {
    redirect("/onboarding/verification");
  }

  redirect("/onboarding/review");
}
