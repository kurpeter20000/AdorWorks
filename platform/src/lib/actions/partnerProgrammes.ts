"use server";

import { z } from "zod";
import { randomInt } from "crypto";
import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageCohort, partnerOrgsAdminedBy } from "@/lib/dal/pathways";
import { newJoinCode } from "@/lib/domain/pathways";
import { normalisePhone } from "@/lib/domain/payoutMethods";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";
import { msg } from "@/i18n/config";
import type { FormState } from "./auth";

/**
 * Partner self-service (0124, owner decision): approved programme partners
 * create their own cohorts and invite their own team from their employer
 * account. Staff keep background checks and the data-sharing agreement.
 */
type Admin = ReturnType<typeof createAdminClient>;

/** Staff: approve (or stop) an organisation as a programme partner. */
export async function setProgrammePartner(organisationId: string, enabled: boolean): Promise<{ error?: string }> {
  const session = await requireRole("admin", "finance");
  const admin = createAdminClient();
  const { error } = await admin.from("organisations").update({ is_programme_partner: enabled }).eq("id", organisationId);
  if (error) return { error: error.message };
  await logAuditEvent(admin, { name: DOMAIN_EVENTS.PROGRAMME_UPDATED, actorId: session.userId, entityType: "organisations", entityId: organisationId, source: "platform", after: { isProgrammePartner: enabled } });
  revalidatePath("/operations/settings");
  return {};
}

const CohortSchema = z.object({
  organisationId: z.string().uuid(),
  name: z.string().trim().min(2, msg("Give the cohort a name.")).max(160),
  programmeType: z.enum(["career_readiness", "portfolio_studio", "graduate_launchpad", "internship_bridge", "train_the_trainer", "hiring_young_people", "other"]),
  funder: z.string().trim().max(160),
  region: z.string().trim().max(120),
  startsOn: z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/, msg("Use a date like 2027-06-30.")),
  endsOn: z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/, msg("Use a date like 2027-06-30.")),
  targetPlaced: z.string().trim().regex(/^\d{0,5}$/, msg("Enter a whole number.")),
});

/** Partner organisation admin: create a cohort. They become its partner admin. */
export async function partnerCreateCohort(_prev: FormState, formData: FormData): Promise<FormState & { createdId?: string }> {
  const session = await requireSession();
  const f = (k: string) => String(formData.get(k) ?? "");
  const parsed = CohortSchema.safeParse({
    organisationId: f("organisationId"),
    name: f("name"),
    programmeType: f("programmeType") || "career_readiness",
    funder: f("funder"),
    region: f("region"),
    startsOn: f("startsOn"),
    endsOn: f("endsOn"),
    targetPlaced: f("targetPlaced"),
  });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const v = parsed.data;
  if (!(await partnerOrgsAdminedBy(session.userId)).includes(v.organisationId)) {
    return { message: msg("Only an admin of an approved programme partner can create cohorts.") };
  }
  const admin = createAdminClient();
  const { data: org } = await admin.from("organisations").select("name").eq("id", v.organisationId).maybeSingle();
  if (!org) return { message: msg("Organisation not found.") };

  let created: { id: string } | null = null;
  for (let attempt = 0; attempt < 4 && !created; attempt++) {
    const res = await admin
      .from("programmes")
      .insert({
        name: v.name,
        partner_name: org.name,
        partner_organisation_id: v.organisationId,
        programme_type: v.programmeType,
        funder: v.funder || null,
        region: v.region || null,
        starts_on: v.startsOn || null,
        ends_on: v.endsOn || null,
        target_placed: v.targetPlaced ? Number(v.targetPlaced) : null,
        join_code: newJoinCode(org.name, randomInt),
        created_by: session.userId,
      })
      .select("id")
      .single();
    if (res.error && res.error.code !== "23505") return { message: res.error.message };
    created = res.data;
  }
  if (!created) return { message: msg("Could not create a join code. Please try again.") };
  await admin.from("programme_partner_users").upsert({ programme_id: created.id, user_id: session.userId, role: "admin", added_by: session.userId });
  await logAuditEvent(admin, { name: DOMAIN_EVENTS.PROGRAMME_UPDATED, actorId: session.userId, entityType: "programmes", entityId: created.id, source: "platform", after: { createdByPartner: true, ...v } });
  revalidatePath("/partner");
  return { createdId: created.id };
}

/** Find an account by email or phone. */
async function findAccount(admin: Admin, raw: string): Promise<string | null> {
  const value = raw.trim();
  const phone = value.includes("@") ? null : normalisePhone(value);
  if (phone) {
    const { data } = await admin.from("profiles").select("id").eq("phone", phone).limit(1);
    if (data?.[0]) return data[0].id;
    return null;
  }
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const hit = data.users.find((u) => u.email?.toLowerCase() === value.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

const InviteSchema = z.object({
  account: z.string().trim().min(5, msg("Enter their email or phone number.")),
  role: z.enum(["viewer", "admin", "facilitator"]),
});

/**
 * Partner admin (or staff): add someone to the cohort's team. A
 * facilitator can't run sessions until AdorWorks staff record their
 * background check.
 */
export async function partnerInviteTeamMember(programmeId: string, _prev: FormState, formData: FormData): Promise<FormState & { saved?: string }> {
  const session = await requireSession();
  if (!(await canManageCohort(session.userId, session.role, programmeId))) return { message: msg("Only the cohort's admins can manage its team.") };
  const parsed = InviteSchema.safeParse({ account: formData.get("account") ?? "", role: formData.get("role") ?? "viewer" });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const admin = createAdminClient();
  const userId = await findAccount(admin, parsed.data.account);
  if (!userId) return { errors: { account: [msg("No AdorWorks account uses that email or phone. Ask them to create one first.")] } };

  const { error } =
    parsed.data.role === "facilitator"
      ? await admin.from("programme_facilitators").upsert({ programme_id: programmeId, user_id: userId }, { onConflict: "programme_id,user_id", ignoreDuplicates: true })
      : await admin.from("programme_partner_users").upsert({ programme_id: programmeId, user_id: userId, role: parsed.data.role, added_by: session.userId }, { onConflict: "programme_id,user_id" });
  if (error) return { message: error.message };
  await logAuditEvent(admin, { name: DOMAIN_EVENTS.PROGRAMME_UPDATED, actorId: session.userId, subjectId: userId, entityType: "programmes", entityId: programmeId, source: "platform", after: { teamMemberAdded: parsed.data.role } });
  revalidatePath(`/partner/${programmeId}/team`);
  return { saved: parsed.data.role };
}

/** Partner admin (or staff): remove a viewer/admin or facilitator from the cohort's team (never yourself). */
export async function partnerRemoveTeamMember(programmeId: string, userId: string, kind: "partner" | "facilitator"): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!(await canManageCohort(session.userId, session.role, programmeId))) return { error: msg("Only the cohort's admins can manage its team.") };
  if (userId === session.userId) return { error: msg("You can't remove yourself.") };
  const admin = createAdminClient();
  const table = kind === "facilitator" ? "programme_facilitators" : "programme_partner_users";
  const { error } = await admin.from(table).delete().eq("programme_id", programmeId).eq("user_id", userId);
  if (error) return { error: error.message };
  await logAuditEvent(admin, { name: DOMAIN_EVENTS.PROGRAMME_UPDATED, actorId: session.userId, subjectId: userId, entityType: "programmes", entityId: programmeId, source: "platform", after: { teamMemberRemoved: kind } });
  revalidatePath(`/partner/${programmeId}/team`);
  return {};
}

/** Partner admin (or staff): close a cohort to new joiners, or reopen it. */
export async function partnerSetCohortOpen(programmeId: string, open: boolean): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!(await canManageCohort(session.userId, session.role, programmeId))) return { error: msg("Only the cohort's admins can do this.") };
  const admin = createAdminClient();
  const { error } = await admin.from("programmes").update({ active: open }).eq("id", programmeId);
  if (error) return { error: error.message };
  revalidatePath(`/partner/${programmeId}/team`);
  return {};
}
