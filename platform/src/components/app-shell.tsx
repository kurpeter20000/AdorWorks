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

  return (
    <AppShellClient
      actions={experience.actions}
      mode={mode}
      role={session.role}
      displayName={session.fullName || session.email || "Account"}
      unreadCount={unreadCount ?? 0}
      marketingSiteUrl={MARKETING_SITE_URL}
    >
      {children}
    </AppShellClient>
  );
}
