"use server";

import { z } from "zod";
import { randomInt } from "crypto";
import { revalidatePath } from "next/cache";
import { requireRole, CLIENT_ROLES } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";
import type { FormState } from "./auth";

// Same "easy to read aloud" alphabet as backend/api's onboarding-agent
// temporary passwords (no 0/O/1/I/l) — an admin relays this directly to
// their invited teammate, same reasoning: no reliable email-delivery
// channel exists in this project yet.
const READABLE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
function generateTemporaryPassword(length = 10) {
  let out = "";
  for (let i = 0; i < length; i++) out += READABLE_CHARS[randomInt(READABLE_CHARS.length)];
  return out;
}

async function requireOrgAdmin(organisationId: string) {
  const session = await requireRole(...CLIENT_ROLES);
  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", organisationId)
    .eq("user_id", session.userId)
    .maybeSingle();
  if (!membership || membership.role !== "admin") {
    throw new Error("Only a team admin can do this.");
  }
  return session;
}

export interface InviteState extends FormState {
  temporaryPassword?: string;
  inviteToken?: string;
}

const InviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  fullName: z.string().trim().min(2).optional(),
  role: z.enum(["member", "admin", "recruiter", "hiring_manager", "finance", "viewer"]),
});

/**
 * Admin-only. S06-05: creates a real, pending invitation with a token and
 * a 7-day expiry, rather than immediately granting organisation_members
 * access — nothing previously "expired" or rejected a reused invite; a
 * repeat invite just silently upserted the same membership row. Any prior
 * still-pending invitation to the same email for this org is revoked
 * first, so re-inviting someone always produces exactly one live invite,
 * not a stack of stale ones.
 *
 * A brand-new email also gets a real, one-time temporary password so they
 * can sign in at all (same pattern as staff inviting an onboarding agent —
 * nothing in this project can reliably deliver anything by email yet, so
 * both the password and the invite link are relayed by the admin
 * out-of-band, same trust model either way). An EXISTING account's role is
 * never overwritten by this — Stage 0's audit flagged the old "replace
 * whatever role they had" behaviour as a highest-priority violation.
 * Team membership only takes effect once the invite is accepted (see
 * acceptTeamInvitation, platform/src/app/organisation/invite/[token]).
 */
export async function inviteTeamMember(
  organisationId: string,
  _prevState: InviteState,
  formData: FormData
): Promise<InviteState> {
  const session = await requireOrgAdmin(organisationId);

  const validated = InviteSchema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName") || undefined,
    role: formData.get("role"),
  });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }
  const v = validated.data;

  const admin = createAdminClient();
  const { data: existingUsers, error: listError } = await admin.auth.admin.listUsers();
  if (listError) return { message: `Could not look up that account: ${listError.message}` };
  const existing = existingUsers.users.find((u) => u.email?.toLowerCase() === v.email.toLowerCase());

  let temporaryPassword: string | undefined;
  if (!existing) {
    temporaryPassword = generateTemporaryPassword();
    const { error: createError } = await admin.auth.admin.createUser({
      email: v.email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: v.fullName || null, intended_role: "individual_client" },
    });
    if (createError) return { message: `Could not create an account: ${createError.message}` };
  }

  await admin
    .from("organisation_team_invitations")
    .update({ status: "revoked" })
    .eq("organisation_id", organisationId)
    .eq("status", "pending")
    .ilike("email", v.email);

  const { data: invitation, error: inviteError } = await admin
    .from("organisation_team_invitations")
    .insert({ organisation_id: organisationId, email: v.email, role: v.role, invited_by: session.userId })
    .select("id, token")
    .single();
  if (inviteError) return { message: `Could not create this invitation: ${inviteError.message}` };

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.TEAM_MEMBER_INVITED,
    actorId: session.userId,
    entityType: "organisation_team_invitations",
    entityId: invitation.id,
    source: "platform",
    after: { role: v.role, email: v.email },
    metadata: { organisationId, existingAccount: !!existing },
  });

  revalidatePath("/organisation/team");
  return { temporaryPassword, inviteToken: invitation.token };
}

/**
 * Called from the invite-accept page once the visitor is signed in. Checks
 * the token is still pending and not expired, and that the signed-in
 * account's own email matches the invited address (case-insensitive) —
 * the link itself isn't treated as sufficient proof, same reasoning
 * offers.ts's acceptOffer applies to its own token-adjacent flow.
 */
export async function acceptTeamInvitation(token: string): Promise<{ error?: string; organisationName?: string }> {
  const session = await requireRole(...CLIENT_ROLES, "talent");
  const admin = createAdminClient();

  const { data: invitation } = await admin
    .from("organisation_team_invitations")
    .select("id, organisation_id, email, role, status, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!invitation) return { error: "This invitation link is not valid." };
  if (invitation.status !== "pending") return { error: "This invitation has already been used or was revoked." };
  if (new Date(invitation.expires_at) < new Date()) return { error: "This invitation has expired — ask an admin to send a new one." };

  const { data: authUser } = await admin.auth.admin.getUserById(session.userId);
  if (authUser.user?.email?.toLowerCase() !== invitation.email.toLowerCase()) {
    return { error: "This invitation was sent to a different email address — sign in as that account to accept it." };
  }

  const { data: org } = await admin.from("organisations").select("name").eq("id", invitation.organisation_id).single();

  const { error: memberError } = await admin
    .from("organisation_members")
    .upsert({ organisation_id: invitation.organisation_id, user_id: session.userId, role: invitation.role });
  if (memberError) return { error: `Could not add you to the team: ${memberError.message}` };

  await admin
    .from("organisation_team_invitations")
    .update({ status: "accepted", accepted_by: session.userId, accepted_at: new Date().toISOString() })
    .eq("id", invitation.id);

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.TEAM_MEMBER_INVITED,
    actorId: session.userId,
    entityType: "organisation_team_invitations",
    entityId: invitation.id,
    source: "platform",
    after: { role: invitation.role },
    metadata: { organisationId: invitation.organisation_id, stage: "accepted" },
  });

  revalidatePath("/organisation/team");
  return { organisationName: org?.name };
}

export async function revokeTeamInvitation(organisationId: string, invitationId: string): Promise<void> {
  await requireOrgAdmin(organisationId);
  const supabase = await createClient();
  await supabase
    .from("organisation_team_invitations")
    .update({ status: "revoked" })
    .eq("id", invitationId)
    .eq("organisation_id", organisationId)
    .eq("status", "pending");
  revalidatePath("/organisation/team");
}

export async function changeTeamMemberRole(
  organisationId: string,
  memberId: string,
  role: "member" | "admin" | "recruiter" | "hiring_manager" | "finance" | "viewer"
): Promise<void> {
  const session = await requireOrgAdmin(organisationId);
  const supabase = await createClient();
  const { data: before } = await supabase
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", organisationId)
    .eq("user_id", memberId)
    .maybeSingle();
  await supabase
    .from("organisation_members")
    .update({ role })
    .eq("organisation_id", organisationId)
    .eq("user_id", memberId);

  // S06-12: role changes previously left no trace in audit_events at all.
  const admin = createAdminClient();
  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.TEAM_MEMBER_ROLE_CHANGED,
    actorId: session.userId,
    subjectId: memberId,
    entityType: "organisation_members",
    entityId: `${organisationId}:${memberId}`,
    source: "platform",
    before: before ? { role: before.role } : null,
    after: { role },
    metadata: { organisationId },
  });

  revalidatePath("/organisation/team");
}

export async function removeTeamMember(organisationId: string, memberId: string): Promise<void> {
  const session = await requireOrgAdmin(organisationId);
  const supabase = await createClient();

  const { data: org } = await supabase.from("organisations").select("representative_id").eq("id", organisationId).single();
  if (org?.representative_id === memberId) {
    throw new Error("The original representative can't be removed from the team.");
  }

  const { data: before } = await supabase
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", organisationId)
    .eq("user_id", memberId)
    .maybeSingle();

  await supabase.from("organisation_members").delete().eq("organisation_id", organisationId).eq("user_id", memberId);

  // S06-12: removals previously left no trace in audit_events at all.
  const admin = createAdminClient();
  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.TEAM_MEMBER_REMOVED,
    actorId: session.userId,
    subjectId: memberId,
    entityType: "organisation_members",
    entityId: `${organisationId}:${memberId}`,
    source: "platform",
    before: before ? { role: before.role } : null,
    metadata: { organisationId },
  });

  revalidatePath("/organisation/team");
}
