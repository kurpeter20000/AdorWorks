import type { ReactNode } from "react";
import { verifySession } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { getDashboardExperience } from "@/lib/domain/navigation";
import { getDashboardKind } from "@/lib/domain/roles";
import { MARKETING_SITE_URL } from "@/lib/domain/marketingSite";
import { AppShellClient } from "./app-shell-client";
import type { SwitchableMode } from "./mode-switcher";

/**
 * Server wrapper: reads the session (verifySession never redirects — see
 * its own doc comment) and renders the bare page on a signed-out route
 * (login, signup, the marketing-adjacent landing page, etc share the same
 * root layout as every authenticated route). Fetches the one piece of
 * live data the shell itself needs (unread notification count) here, so
 * the client shell stays a pure presentational/interactive component.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const session = await verifySession();
  // flex flex-1 flex-col: body is itself `flex flex-col` (see app/layout.tsx),
  // so this makes #main-content stretch to fill the viewport and, in turn,
  // become a flex container its own children (e.g. (auth)/layout.tsx's
  // split-screen) can stretch inside of — without it, signed-out pages
  // that assume full-height flex sizing collapse to their content height.
  if (!session) return <div id="main-content" className="flex flex-1 flex-col">{children}</div>;

  const supabase = await createClient();
  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", session.userId)
    .is("read_at", null);

  const dashboardKind = getDashboardKind(session.role);
  const experience = getDashboardExperience(session.role);
  const mode: SwitchableMode | null =
    dashboardKind === "talent" || dashboardKind === "employer" ? dashboardKind : null;

  // Account-menu avatar: the talent's own photo, or their org's logo —
  // one extra query, only for the role that actually has one, not fired
  // for staff (dashboardKind is neither) since this wrapper renders on
  // every authenticated page.
  let avatarUrl: string | null = null;
  let profileHref: string | null = null;
  if (dashboardKind === "talent") {
    profileHref = "/passport";
    const { data: profile } = await supabase
      .from("talent_profiles")
      .select("avatar_path")
      .eq("id", session.userId)
      .maybeSingle();
    if (profile?.avatar_path) {
      avatarUrl = supabase.storage.from("talent-avatars").getPublicUrl(profile.avatar_path).data.publicUrl;
    }
  } else if (dashboardKind === "employer") {
    profileHref = "/organisation";
    const { data: membership } = await supabase
      .from("organisation_members")
      .select("organisation_id")
      .eq("user_id", session.userId)
      .maybeSingle();
    if (membership) {
      const { data: org } = await supabase
        .from("organisations")
        .select("logo_path")
        .eq("id", membership.organisation_id)
        .maybeSingle();
      if (org?.logo_path) {
        avatarUrl = supabase.storage.from("org-logos").getPublicUrl(org.logo_path).data.publicUrl;
      }
    }
  }

  return (
    <AppShellClient
      actions={experience.actions}
      mode={mode}
      role={session.role}
      displayName={session.fullName || session.email || "Account"}
      unreadCount={unreadCount ?? 0}
      marketingSiteUrl={MARKETING_SITE_URL}
      avatarUrl={avatarUrl}
      profileHref={profileHref}
    >
      {children}
    </AppShellClient>
  );
}
