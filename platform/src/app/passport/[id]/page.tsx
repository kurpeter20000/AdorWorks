import type { Metadata } from "next";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { verifySession } from "@/lib/dal/session";
import { ReportButton } from "@/components/report-button";

export const metadata: Metadata = { title: "AdorWorks Passport" };

const TIER_LABEL: Record<string, string> = {
  registered: "Registered",
  identity_verified: "Identity verified",
  adorverified: "AdorVerified",
  adorcertified: "AdorCertified",
  team_lead: "Team lead",
};

export default async function PublicPassportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const session = await verifySession();

  // No requireSession/requireRole here on purpose — this page must be
  // readable by a signed-out visitor. Reads the column-limited
  // public_talent_profiles view (0034), not the base table with
  // select("*") — the view can never expose a column this page doesn't
  // already render, regardless of what gets added to talent_profiles
  // later. RLS's public_visible = true branch is still what actually
  // gates the read: an unpublished or nonexistent profile just comes
  // back as no row.
  const { data: profile } = await supabase.from("public_talent_profiles").select("*").eq("id", id).maybeSingle();

  if (!profile) {
    return (
      <main className="mx-auto max-w-2xl p-6 sm:p-8">
        <p className="text-sm text-slate">This profile isn&rsquo;t available.</p>
      </main>
    );
  }

  const { data: items } = await supabase
    .from("talent_portfolio_items")
    .select("*")
    .eq("talent_id", id)
    .order("created_at", { ascending: false });

  const { data: workHistory } = await supabase
    .from("work_history")
    .select("id, title, summary, organisation_id, completed_at")
    .eq("talent_id", id)
    .order("completed_at", { ascending: false });
  const orgIds = [...new Set((workHistory ?? []).map((w) => w.organisation_id))];
  const { data: orgs } =
    orgIds.length > 0 ? await supabase.from("organisations").select("id, name").in("id", orgIds) : { data: [] };
  const orgNameById = new Map((orgs ?? []).map((o) => [o.id, o.name]));
  const avatarUrl = profile.avatar_path
    ? supabase.storage.from("talent-avatars").getPublicUrl(profile.avatar_path).data.publicUrl
    : null;

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <div className="rounded-xl border border-slate/15 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            {avatarUrl && (
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-cloud">
                <Image src={avatarUrl} alt="" fill sizes="64px" className="object-cover" />
              </div>
            )}
            <div>
              <p className="text-lg font-bold text-midnight">{profile.display_name}</p>
              <p className="text-sm text-slate">{profile.headline}</p>
            </div>
          </div>
          <span className="whitespace-nowrap rounded-full bg-violet/10 px-3 py-1 text-xs font-semibold text-violet">
            {TIER_LABEL[profile.verification_tier] ?? profile.verification_tier}
          </span>
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

        {(profile.linkedin_url || profile.github_url || profile.website_url || profile.portfolio_url) && (
          <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold text-teal-ink">
            {profile.linkedin_url && (
              <a href={profile.linkedin_url} target="_blank" rel="noreferrer" className="underline">
                LinkedIn
              </a>
            )}
            {profile.github_url && (
              <a href={profile.github_url} target="_blank" rel="noreferrer" className="underline">
                GitHub
              </a>
            )}
            {profile.website_url && (
              <a href={profile.website_url} target="_blank" rel="noreferrer" className="underline">
                Website
              </a>
            )}
            {profile.portfolio_url && (
              <a href={profile.portfolio_url} target="_blank" rel="noreferrer" className="underline">
                Portfolio
              </a>
            )}
          </div>
        )}
        {session && (
          <div className="mt-4 border-t border-slate/10 pt-3">
            <ReportButton targetType="talent_profile" targetId={profile.id} />
          </div>
        )}
      </div>

      {workHistory && workHistory.length > 0 && (
        <div className="mt-6">
          <h2 className="font-bold text-midnight">Verified work history</h2>
          <p className="mt-1 text-xs text-slate">Completed contracts on AdorWorks — recorded automatically, not self-reported.</p>
          <ul className="mt-3 space-y-3">
            {workHistory.map((w) => (
              <li key={w.id} className="rounded-xl border border-slate/15 bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-midnight">{w.title}</p>
                    <p className="text-xs text-slate">{orgNameById.get(w.organisation_id) ?? "AdorWorks employer"}</p>
                  </div>
                  <span className="whitespace-nowrap text-xs text-slate">
                    {new Date(w.completed_at).toLocaleDateString(undefined, { year: "numeric", month: "short" })}
                  </span>
                </div>
                {w.summary && <p className="mt-2 text-xs text-slate">{w.summary}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {items && items.length > 0 && (
        <div className="mt-6">
          <h2 className="font-bold text-midnight">Portfolio</h2>
          <ul className="mt-3 space-y-3">
            {items.map((item) => {
              const fileUrl = item.file_path
                ? supabase.storage.from("talent-portfolio").getPublicUrl(item.file_path).data.publicUrl
                : null;
              const isPdf = item.file_path?.toLowerCase().endsWith(".pdf") ?? false;
              return (
                <li key={item.id} className="rounded-xl border border-slate/15 bg-white p-4">
                  {fileUrl && !isPdf && (
                    <div className="relative mb-3 h-64 w-full overflow-hidden rounded-lg">
                      <Image src={fileUrl} alt={item.title} fill sizes="(max-width: 640px) 100vw, 640px" className="object-cover" />
                    </div>
                  )}
                  <p className="text-sm font-semibold text-midnight">{item.title}</p>
                  {item.description && <p className="text-xs text-slate">{item.description}</p>}
                  <div className="mt-1 flex flex-wrap gap-3">
                    {item.external_url && (
                      <a
                        href={item.external_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-teal-ink underline"
                      >
                        View link
                      </a>
                    )}
                    {fileUrl && isPdf && (
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-teal-ink underline"
                      >
                        View document
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </main>
  );
}
