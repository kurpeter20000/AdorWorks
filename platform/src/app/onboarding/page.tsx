import type { Metadata } from "next";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Complete your profile" };

/**
 * Onboarding step 1 landing (spec: "Account and role selection" is
 * already done at signup; this is where the resumable, per-step flow
 * picks up — spec steps 2-10). Full multi-step wizard is built out
 * incrementally; this establishes the entry point, auth guard, and
 * "resume where you left off" read.
 */
export default async function OnboardingPage() {
  const session = await requireRole("talent");
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("talent_profiles")
    .select("headline, bio, category")
    .eq("id", session.userId)
    .maybeSingle();

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-extrabold text-midnight">Complete your profile</h1>
      <p className="mt-2 text-sm text-slate">
        A few short steps. Your progress is saved after every step, so you
        can stop and come back any time.
      </p>

      <div className="mt-6 rounded-xl border border-slate/15 bg-white p-5">
        {profile ? (
          <p className="text-sm text-slate">
            Picking up where you left off — headline: {profile.headline ?? "not set yet"}.
          </p>
        ) : (
          <p className="text-sm text-slate">Let&apos;s start with the basics.</p>
        )}
      </div>
    </main>
  );
}
