import "server-only";
import { redirect } from "next/navigation";
import { requireSession, CLIENT_ROLES, type VerifiedSession } from "./session";
import { createClient } from "@/lib/supabase/server";
import type { OrganisationRow, OrganisationMemberRole } from "@/lib/database.types";

export interface OrganisationMembership {
  session: VerifiedSession;
  org: OrganisationRow;
  myRole: OrganisationMemberRole;
}

/**
 * Resolves "your organisation" via organisation_members, not
 * representative_id — every org (old or new) has its representative
 * auto-added as an admin member (see migration 0016), so this covers the
 * original creator and any later-invited teammate identically, REGARDLESS
 * of their profiles.role — inviting someone no longer overwrites that
 * role (see organisationTeam.ts), so membership itself is the real
 * authorization signal now, checked before any role gate.
 *
 * Only falls back to the CLIENT_ROLES gate when there's no membership at
 * all, preserving the original behaviour for that case: a plain talent
 * with no org still can't land on /organisation/setup and see a form
 * they're not meant to submit. Returns null (not a redirect there) —
 * /organisation/setup needs to know "no org yet" without being redirected
 * to itself.
 */
export async function getMyOrganisationMembership(): Promise<OrganisationMembership | null> {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: membership } = await supabase
    .from("organisation_members")
    .select("organisation_id, role")
    .eq("user_id", session.userId)
    .maybeSingle();

  if (!membership) {
    if (!CLIENT_ROLES.includes(session.role)) {
      redirect("/dashboard?error=forbidden");
    }
    return null;
  }

  const { data: org } = await supabase
    .from("organisations")
    .select("*")
    .eq("id", membership.organisation_id)
    .maybeSingle();
  if (!org) return null;

  return { session, org, myRole: membership.role };
}

/** For pages that require an existing org membership. Redirects to /organisation/setup if none. */
export async function requireOrganisationMembership(): Promise<OrganisationMembership> {
  const membership = await getMyOrganisationMembership();
  if (!membership) redirect("/organisation/setup");
  return membership;
}
