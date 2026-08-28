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
}

const InviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  fullName: z.string().trim().min(2).optional(),
  role: z.enum(["member", "admin", "recruiter", "hiring_manager", "finance", "viewer"]),
});

/**
 * Admin-only. Finds or creates the invited email's account (a brand-new
 * one gets a real, one-time temporary password — same pattern as staff
 * inviting an onboarding agent, for the same reason: nothing in this
 * project can reliably deliver a password by email yet).
 *
 * Only a brand-new account gets profiles.role set to the chosen org role.
 * An EXISTING account's role is never overwritten — Stage 0's audit
 * flagged the old "replace whatever role they had" behaviour as a
 * highest-priority violation, since inviting an existing talent (or any
 * other account) to a team silently destroyed their real role. Team
 * membership (organisation_members) is what actually grants org access
 * now (see getMyOrganisationMembership) — it no longer depends on
 * profiles.role being overwritten to work.
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

  let userId: string;
  let temporaryPassword: string | undefined;
  if (existing) {
    userId = existing.id;
  } else {
    temporaryPassword = generateTemporaryPassword();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: v.email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: v.fullName || null },
    });
    if (createError) return { message: `Could not create an account: ${createError.message}` };
    userId = created.user.id;

    // profiles.role only distinguishes org_admin vs org_member — the finer
    // recruiter/hiring_manager/finance/viewer scopes (0033) live entirely
    // in organisation_members.role, not here.
    const newRole = v.role === "admin" ? "org_admin" : "org_member";
    await admin.from("profiles").update({ role: newRole }).eq("id", userId);
    await logAuditEvent(admin, {
      name: DOMAIN_EVENTS.ACCOUNT_ROLE_ASSIGNED,
      actorId: session.userId,
      subjectId: userId,
      entityType: "profiles",
      entityId: userId,
      source: "platform",
      after: { role: newRole },
      metadata: { reason: "organisation_invite", organisationId },
    });
  }

  const { error: memberError } = await admin
    .from("organisation_members")
    .upsert({ organisation_id: organisationId, user_id: userId, role: v.role });
  if (memberError) return { message: `Could not add them to the team: ${memberError.message}` };

  revalidatePath("/organisation/team");
  return { temporaryPassword };
}

export async function changeTeamMemberRole(
  organisationId: string,
  memberId: string,
  role: "member" | "admin" | "recruiter" | "hiring_manager" | "finance" | "viewer"
): Promise<void> {
  await requireOrgAdmin(organisationId);
  const supabase = await createClient();
  await supabase
    .from("organisation_members")
    .update({ role })
    .eq("organisation_id", organisationId)
    .eq("user_id", memberId);
  revalidatePath("/organisation/team");
}

export async function removeTeamMember(organisationId: string, memberId: string): Promise<void> {
  await requireOrgAdmin(organisationId);
  const supabase = await createClient();

  const { data: org } = await supabase.from("organisations").select("representative_id").eq("id", organisationId).single();
  if (org?.representative_id === memberId) {
    throw new Error("The original representative can't be removed from the team.");
  }

  await supabase.from("organisation_members").delete().eq("organisation_id", organisationId).eq("user_id", memberId);
  revalidatePath("/organisation/team");
}
