import "server-only";
import { redirect } from "next/navigation";
import { requireRole, type VerifiedSession } from "./session";
import { createClient } from "@/lib/supabase/server";
import type { OrganisationRow } from "@/lib/database.types";

// Any role that can be part of an org team — the original self-service
// creator (individual_client) or someone invited afterward
// (org_member/org_admin). requireRole(...) bounces anything else straight
// to /dashboard, same as every org page already did for individual_client
// alone before team permissions existed.
const ORG_ROLES = ["individual_client", "org_member", "org_admin"] as const;

export interface OrganisationMembership {
  session: VerifiedSession;
  org: OrganisationRow;
  myRole: "member" | "admin";
}

/**
 * Resolves "your organisation" via organisation_members, not
 * representative_id — every org (old or new) has its representative
 * auto-added as an admin member (see migration 0016), so this covers the
 * original creator and any later-invited teammate identically. Returns
 * null rather than redirecting — /organisation/setup needs to know "no
 * org yet" without being redirected to itself.
 */
export async function getMyOrganisationMembership(): Promise<OrganisationMembership | null> {
  const session = await requireRole(...ORG_ROLES);
  const supabase = await createClient();

  const { data: membership } = await supabase
    .from("organisation_members")
    .select("organisation_id, role")
    .eq("user_id", session.userId)
    .maybeSingle();
  if (!membership) return null;

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
