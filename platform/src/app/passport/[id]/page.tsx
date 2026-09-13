import type { Metadata } from "next";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySession } from "@/lib/dal/session";
import { ReportButton } from "@/components/report-button";
import { StatePanel } from "@/components/state-panel";

export const metadata: Metadata = { title: "AdorWorks Passport" };

const TIER_LABEL: Record<string, string> = {
  registered: "Registered",
  identity_verified: "Identity verified",
  adorverified: "AdorVerified",
  adorcertified: "AdorCertified",
  team_lead: "Team lead",
};

// S05-11 — the exact same column list as public_talent_profiles (0034,
// extended with cv_path by 0065), reproduced here so an owner's preview
// reads the base table (their own row is always readable regardless of
// public_visible — talent_profiles_select, 0002) while still only ever
// seeing what the public view would expose. Keep this in sync with
// 0034/0065 if that view's column list changes. One literal string, not
// built via concatenation — supabase-js infers the returned row shape
// from this as a template-literal type, which only works when the
// argument is a literal at the call site, not a runtime-concatenated
// string (that widens to plain `string`).
const PREVIEW_SAFE_COLUMNS =
  "id, headline, category, skills, languages, location, work_mode, availability, years_experience, portfolio_url, verification_tier, display_name, bio, linkedin_url, github_url, website_url, avatar_path, cv_path, public_visible";

export default async function PublicPassportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const session = await verifySession();
  const isOwnerPreview = session?.userId === id;

  // No requireSession/requireRole here on purpose — this page must be
  // readable by a signed-out visitor. For everyone else, reads the
  // column-limited public_talent_profiles view (0034), not the base
  // table with select("*") — the view can never expose a column this
  // page doesn't already render, regardless of what gets added to
  // talent_profiles later. RLS's public_visible = true branch is what
  // actually gates the read: an unpublished or nonexistent profile just
  // comes back as no row. The owner previewing their own (possibly
  // not-yet-published) profile is the one exception — see
  // PREVIEW_SAFE_COLUMNS above for how that stays column-equivalent.
  const { data: profile } = isOwnerPreview
    ? await supabase.from("talent_profiles").select(PREVIEW_SAFE_COLUMNS).eq("id", id).maybeSingle()
    : await supabase.from("public_talent_profiles").select("*").eq("id", id).maybeSingle();

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
    .order("sort_order", { ascending: true });

  // S05-07 — talent-portfolio is now a private bucket (migration 0065).
  // Signed server-side with the admin client, same reasoning as the
  // introduction video below: this page is public/anonymous-reachable,
  // and by the time this runs `profile` already proves the viewer is
  // authorized to see this content (either a genuinely published
  // profile, or the owner's own preview) — no further per-item check
  // needed. Never persisted, recomputed fresh on every render.
  const adminForFiles = createAdminClient();
  const portfolioFileUrls = new Map(
    await Promise.all(
      (items ?? [])
        .filter((item) => item.file_path)
        .map(async (item) => {
          const { data } = await adminForFiles.storage.from("talent-portfolio").createSignedUrl(item.file_path!, 3600);
          return [item.id, data?.signedUrl ?? null] as const;
        })
    )
  );

  // S05-06 — same pattern, for the CV slot.
  const cvUrl = profile.cv_path
    ? (await adminForFiles.storage.from("talent-cv").createSignedUrl(profile.cv_path, 3600)).data?.signedUrl ?? null
    : null;

  // Signed URL generated server-side with the admin client, not the
  // viewer's own session — this page is public/anonymous-reachable, and
  // talent-videos is a private bucket. Explicit application-code checks
  // here (status/public_visible) mirror exactly what the table's own RLS
  // would enforce; see 0055's migration comment for why this path was
  // chosen over teaching storage.objects RLS to reach into two other
  // RLS-protected tables. Never persisted — recomputed fresh on every
  // render, so "no private media URL exposed permanently" holds.
  const { data: introVideo } = await supabase
    .from("talent_introduction_videos")
    .select("video_path, thumbnail_path, transcript, status")
    .eq("talent_id", id)
    .eq("status", "approved")
    .maybeSingle();
  let videoUrl: string | null = null;
  let videoThumbnailUrl: string | null = null;
  // profile came back from public_talent_profiles, whose own WHERE clause
  // already guarantees public_visible = true — no need to re-check it here.
  if (introVideo) {
    const admin = createAdminClient();
    const [videoSigned, thumbSigned] = await Promise.all([
      admin.storage.from("talent-videos").createSignedUrl(introVideo.video_path, 3600),
      introVideo.thumbnail_path
        ? admin.storage.from("talent-videos").createSignedUrl(introVideo.thumbnail_path, 3600)
        : Promise.resolve({ data: null }),
    ]);
    videoUrl = videoSigned.data?.signedUrl ?? null;
    videoThumbnailUrl = thumbSigned?.data?.signedUrl ?? null;
  }

  const { data: workHistory } = await supabase
    .from("work_history")
    .select("id, title, summary, organisation_id, completed_at")
    .eq("talent_id", id)
    .order("completed_at", { ascending: false });

  // S05-05 — self-reported, unlike work_history above (which only
  // records AdorWorks contracts that actually completed) — shown as a
  // clearly separate, distinctly-labeled section for exactly that
  // reason: this is the talent's own claim, not a verified record.
  const { data: workExperience } = await supabase
    .from("talent_work_experience")
    .select("*")
    .eq("talent_id", id)
    .order("sort_order", { ascending: true });
  const orgIds = [...new Set((workHistory ?? []).map((w) => w.organisation_id))];
  const { data: orgs } =
    orgIds.length > 0 ? await supabase.from("organisations").select("id, name").in("id", orgIds) : { data: [] };
  const orgNameById = new Map((orgs ?? []).map((o) => [o.id, o.name]));
  const avatarUrl = profile.avatar_path
    ? supabase.storage.from("talent-avatars").getPublicUrl(profile.avatar_path).data.publicUrl
    : null;

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      {isOwnerPreview && "public_visible" in profile && !profile.public_visible && (
        <div className="mb-4">
          <StatePanel title="Preview" tone="info">
            This is how your Passport will look once AdorWorks publishes it — not visible to employers yet.
          </StatePanel>
        </div>
      )}
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
        {cvUrl && (
          <a
            href={cvUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-xs font-semibold text-teal-ink underline"
          >
            Download CV
          </a>
        )}
        {session && (
          <div className="mt-4 border-t border-slate/10 pt-3">
            <ReportButton targetType="talent_profile" targetId={profile.id} />
          </div>
        )}
      </div>

      {videoUrl && (
        <div className="mt-6">
          <h2 className="font-bold text-midnight">Introduction</h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-slate/15 bg-white">
            <video controls preload="metadata" poster={videoThumbnailUrl ?? undefined} className="w-full" style={{ maxHeight: 480 }}>
              <source src={videoUrl} />
            </video>
          </div>
          {introVideo?.transcript && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-semibold text-teal-ink">Read transcript</summary>
              <p className="mt-2 whitespace-pre-wrap text-xs text-slate">{introVideo.transcript}</p>
            </details>
          )}
          {session && (
            <div className="mt-2">
              <ReportButton targetType="talent_video" targetId={id} />
            </div>
          )}
        </div>
      )}

      {workExperience && workExperience.length > 0 && (
        <div className="mt-6">
          <h2 className="font-bold text-midnight">Work experience</h2>
          <ul className="mt-3 space-y-3">
            {workExperience.map((w) => (
              <li key={w.id} className="rounded-xl border border-slate/15 bg-white p-4">
                <p className="text-sm font-semibold text-midnight">{w.role_title}</p>
                <p className="text-xs text-slate">{w.employer_name}</p>
                <p className="text-xs text-slate">
                  {new Date(w.start_date).toLocaleDateString(undefined, { year: "numeric", month: "short" })} –{" "}
                  {w.end_date
                    ? new Date(w.end_date).toLocaleDateString(undefined, { year: "numeric", month: "short" })
                    : "Present"}
                </p>
                {w.description && <p className="mt-2 text-xs text-slate">{w.description}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

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
              const fileUrl = item.file_path ? portfolioFileUrls.get(item.id) ?? null : null;
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
                  {session && (
                    <div className="mt-2">
                      <ReportButton targetType="portfolio_item" targetId={item.id} />
                    </div>
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
