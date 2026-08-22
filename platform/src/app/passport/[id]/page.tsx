import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

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

  // No requireSession/requireRole here on purpose — this page must be
  // readable by a signed-out visitor. RLS's public_visible = true branch
  // (talent_profiles_select, 0015) is what actually gates the read: an
  // unpublished or nonexistent profile just comes back as no row.
  const { data: profile } = await supabase.from("talent_profiles").select("*").eq("id", id).maybeSingle();

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

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <div className="rounded-xl border border-slate/15 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-lg font-bold text-midnight">{profile.display_name}</p>
            <p className="text-sm text-slate">{profile.headline}</p>
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
          <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold text-teal">
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
      </div>

      {items && items.length > 0 && (
        <div className="mt-6">
          <h2 className="font-bold text-midnight">Portfolio</h2>
          <ul className="mt-3 space-y-3">
            {items.map((item) => {
              const imageUrl = item.file_path
                ? supabase.storage.from("talent-portfolio").getPublicUrl(item.file_path).data.publicUrl
                : null;
              return (
                <li key={item.id} className="rounded-xl border border-slate/15 bg-white p-4">
                  {imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt={item.title} className="mb-3 max-h-64 w-full rounded-lg object-cover" />
                  )}
                  <p className="text-sm font-semibold text-midnight">{item.title}</p>
                  {item.description && <p className="text-xs text-slate">{item.description}</p>}
                  {item.external_url && (
                    <a
                      href={item.external_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-teal underline"
                    >
                      View link
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </main>
  );
}
