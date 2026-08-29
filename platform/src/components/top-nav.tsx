import { verifySession } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { getPrimaryNavLinks } from "@/lib/domain/navigation";
import { TopNavClient } from "./top-nav-client";

/**
 * Server wrapper: reads the session (verifySession never redirects — see
 * its own doc comment) and returns nothing at all on a signed-out page
 * (login, signup, forgot-password, etc share the same root layout as
 * every authenticated route). Fetches the one piece of live data the bar
 * itself needs (unread notification count) here, so the client component
 * stays a pure presentational/interactive shell.
 */
export async function TopNav() {
  const session = await verifySession();
  if (!session) return null;

  const supabase = await createClient();
  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", session.userId)
    .is("read_at", null);

  const links = getPrimaryNavLinks(session.role);

  return (
    <TopNavClient
      links={links}
      unreadCount={unreadCount ?? 0}
      displayName={session.fullName || session.email || "Account"}
      role={session.role}
    />
  );
}
