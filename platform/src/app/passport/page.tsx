import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { ProfessionalLinksForm } from "./professional-links-form";
import { PortfolioManager } from "./portfolio-manager";
import { EvidenceManager } from "./evidence-manager";
import { AvatarUpload } from "./avatar-upload";

export const metadata: Metadata = { title: "Your Passport" };

const TIER_LABEL: Record<string, string> = {
  registered: "Registered",
  identity_verified: "Identity verified",
  adorverified: "AdorVerified",
  adorcertified: "AdorCertified",
  team_lead: "Team lead",
};

export default async function PassportPage() {
  const session = await requireRole("talent");
  const supabase = await createClient();

  const [{ data: profile }, { data: items }, { data: evidence }] = await Promise.all([
    supabase.from("talent_profiles").select("*").eq("id", session.userId).maybeSingle(),
    supabase
      .from("talent_portfolio_items")
      .select("*")
      .eq("talent_id", session.userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("talent_evidence")
      .select("*")
      .eq("talent_id", session.userId)
      .in("evidence_type", ["reference", "assessment"])
      .order("created_at", { ascending: false }),
  ]);

  const references = (evidence ?? []).filter((e) => e.evidence_type === "reference");
  const credentials = (evidence ?? []).filter((e) => e.evidence_type === "assessment");
  const avatarUrl = profile?.avatar_path
    ? supabase.storage.from("talent-avatars").getPublicUrl(profile.avatar_path).data.publicUrl
    : null;

  if (!profile) {
    return (
      <main className="mx-auto max-w-2xl p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold text-midnight">Your Passport</h1>
        <p className="mt-4 text-sm text-slate">
          Finish{" "}
          <Link href="/onboarding" className="font-semibold text-teal-ink underline">
            onboarding
          </Link>{" "}
          first — your Passport is built from your profile basics.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">Your Passport</h1>
      <p className="mt-1 text-sm text-slate">
        {profile.public_visible
          ? "Visible to employers on AdorWorks."
          : "Not public yet — AdorWorks staff publish your Passport once your verification is complete."}
      </p>

      <div className="mt-6 rounded-xl border border-slate/15 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-lg font-bold text-midnight">{profile.display_name}</p>
            <p className="text-sm text-slate">{profile.headline}</p>
          </div>
          <span className="whitespace-nowrap rounded-full bg-violet/10 px-3 py-1 text-xs font-semibold text-violet">
            {TIER_LABEL[profile.verification_tier] ?? profile.verification_tier}
          </span>
        </div>
        <div className="mt-4">
          <AvatarUpload existingUrl={avatarUrl} />
        </div>
        {profile.bio && <p className="mt-3 text-sm text-slate">{profile.bio}</p>}
        <p className="mt-3 text-xs text-slate">
          {[profile.location, profile.work_mode].filter(Boolean).join(" · ")}
        </p>
        {profile.skills.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {profile.skills.map((s) => (
              <span key={s} className="rounded-full bg-cloud px-2.5 py-1 text-xs text-slate">
                {s}
              </span>
            ))}
          </div>
        )}
        {profile.languages.length > 0 && (
          <p className="mt-2 text-xs text-slate">Languages: {profile.languages.join(", ")}</p>
        )}
      </div>

      <div className="mt-6">
        <h2 className="font-bold text-midnight">Professional links</h2>
        <ProfessionalLinksForm initial={profile} />
      </div>

      <div className="mt-6">
        <h2 className="font-bold text-midnight">Portfolio</h2>
        <PortfolioManager items={items ?? []} />
      </div>

      <div className="mt-6">
        <h2 className="font-bold text-midnight">References</h2>
        <p className="mt-1 text-xs text-slate">
          A previous employer or client who can vouch for your work — their name and how to reach
          them, or a reference letter.
        </p>
        <EvidenceManager
          evidenceType="reference"
          notesPlaceholder="e.g. Jane Doe, former manager at XYZ — jane@example.com"
          items={references}
        />
      </div>

      <div className="mt-6">
        <h2 className="font-bold text-midnight">Credentials</h2>
        <p className="mt-1 text-xs text-slate">
          A certificate, diploma or assessment result that backs up your skills.
        </p>
        <EvidenceManager
          evidenceType="assessment"
          notesPlaceholder="What is this credential?"
          items={credentials}
        />
      </div>
    </main>
  );
}
