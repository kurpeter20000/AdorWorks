"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isProgrammeSharingEnabled } from "@/lib/dal/settings";
import { CONSENT_WORDING_VERSION, normaliseConsent } from "@/lib/domain/programmeConsent";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";
import { getLocale } from "@/i18n/server";
import { msg } from "@/i18n/config";
import type { FormState } from "./auth";

/**
 * Programme-partner consent (0120). Every save is a new row (append-only),
 * stamped with the date, language and wording version. Nothing is ever
 * pre-ticked; saying no never affects jobs, verification or payments.
 * Switched off until approved.
 */

const box = (formData: FormData, name: string) => formData.get(name) === "on";

/** Talent: their own choices for one programme. */
export async function saveProgrammeConsent(programmeId: string, _prev: FormState, formData: FormData): Promise<FormState & { saved?: boolean }> {
  const session = await requireRole("talent");
  if (!(await isProgrammeSharingEnabled())) return { message: msg("Programme sharing isn't available yet.") };
  const admin = createAdminClient();
  const { data: member } = await admin
    .from("programme_members")
    .select("programme_id")
    .eq("programme_id", programmeId)
    .eq("talent_id", session.userId)
    .maybeSingle();
  if (!member) return { message: msg("You're not part of this programme.") };

  const choice = normaliseConsent({
    share_named_progress: box(formData, "share_named_progress"),
    share_earnings: box(formData, "share_earnings"),
    share_story: box(formData, "share_story"),
  });
  const { error } = await admin.from("programme_consents").insert({
    programme_id: programmeId,
    talent_id: session.userId,
    ...choice,
    language: await getLocale(),
    wording_version: CONSENT_WORDING_VERSION,
  });
  if (error) return { message: error.message };

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.PROGRAMME_CONSENT_RECORDED,
    actorId: session.userId,
    subjectId: session.userId,
    entityType: "programme_consents",
    entityId: programmeId,
    source: "platform",
    after: { ...choice, wordingVersion: CONSENT_WORDING_VERSION },
  });
  revalidatePath("/programme-sharing");
  return { saved: true };
}

const STAFF_ROLES_FOR_PROGRAMMES = ["admin", "finance"] as const;

const ProgrammeSchema = z.object({
  name: z.string().trim().min(2, "Enter the programme name.").max(160),
  partnerName: z.string().trim().min(2, "Enter the partner's name.").max(160),
  endsOn: z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Use a date like 2027-06-30."),
});

/** Staff: add a programme run by a partner. */
export async function createProgramme(_prev: FormState, formData: FormData): Promise<FormState & { saved?: boolean }> {
  const session = await requireRole(...STAFF_ROLES_FOR_PROGRAMMES);
  const parsed = ProgrammeSchema.safeParse({ name: formData.get("name") ?? "", partnerName: formData.get("partnerName") ?? "", endsOn: formData.get("endsOn") ?? "" });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("programmes")
    .insert({ name: parsed.data.name, partner_name: parsed.data.partnerName, ends_on: parsed.data.endsOn || null, created_by: session.userId })
    .select("id")
    .single();
  if (error) return { message: error.message };
  await logAuditEvent(admin, { name: DOMAIN_EVENTS.PROGRAMME_UPDATED, actorId: session.userId, entityType: "programmes", entityId: data.id, source: "platform", after: parsed.data });
  revalidatePath("/operations/settings");
  return { saved: true };
}

/** Staff: the data-sharing agreement is signed — only now can named data (with consent) be shown. */
export async function markAgreementSigned(programmeId: string): Promise<{ error?: string }> {
  const session = await requireRole(...STAFF_ROLES_FOR_PROGRAMMES);
  const admin = createAdminClient();
  const { error } = await admin.from("programmes").update({ agreement_signed_at: new Date().toISOString() }).eq("id", programmeId).is("agreement_signed_at", null);
  if (error) return { error: error.message };
  await logAuditEvent(admin, { name: DOMAIN_EVENTS.PROGRAMME_UPDATED, actorId: session.userId, entityType: "programmes", entityId: programmeId, source: "platform", after: { agreementSigned: true } });
  revalidatePath("/operations/settings");
  return {};
}

const MemberSchema = z.object({
  email: z.string().trim().email("Enter the talent's email address."),
  isMinor: z.boolean(),
});

/** Staff: add a talent who joined through this programme (found by their account email). */
export async function addProgrammeMember(programmeId: string, _prev: FormState, formData: FormData): Promise<FormState & { saved?: boolean }> {
  const session = await requireRole(...STAFF_ROLES_FOR_PROGRAMMES);
  const parsed = MemberSchema.safeParse({ email: formData.get("email") ?? "", isMinor: formData.get("isMinor") === "on" });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const admin = createAdminClient();

  const email = parsed.data.email.toLowerCase();
  let talentId: string | null = null;
  for (let page = 1; page <= 20 && !talentId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return { message: error.message };
    talentId = data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
    if (data.users.length < 200) break;
  }
  if (!talentId) return { errors: { email: ["No AdorWorks account uses that email."] } };
  const { data: profile } = await admin.from("profiles").select("role").eq("id", talentId).maybeSingle();
  if (profile?.role !== "talent") return { errors: { email: ["That account isn't a talent account."] } };

  const { error } = await admin
    .from("programme_members")
    .upsert({ programme_id: programmeId, talent_id: talentId, is_minor: parsed.data.isMinor, added_by: session.userId });
  if (error) return { message: error.message };
  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.PROGRAMME_UPDATED,
    actorId: session.userId,
    subjectId: talentId,
    entityType: "programme_members",
    entityId: programmeId,
    source: "platform",
    after: { added: true, isMinor: parsed.data.isMinor },
  });
  revalidatePath("/operations/settings");
  return { saved: true };
}

const GuardianSchema = z.object({
  guardianName: z.string().trim().min(2, "Enter the guardian's full name.").max(160),
});

/**
 * Staff: an under-18's guardian agreed in person (paper form). Records the
 * guardian's name with the young person's current choices — or, if they
 * haven't chosen yet, the boxes ticked on the paper form.
 */
export async function recordGuardianConsent(programmeId: string, talentId: string, _prev: FormState, formData: FormData): Promise<FormState & { saved?: boolean }> {
  const session = await requireRole(...STAFF_ROLES_FOR_PROGRAMMES);
  const parsed = GuardianSchema.safeParse({ guardianName: formData.get("guardianName") ?? "" });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const admin = createAdminClient();
  const { data: member } = await admin.from("programme_members").select("is_minor").eq("programme_id", programmeId).eq("talent_id", talentId).maybeSingle();
  if (!member) return { message: "This person isn't in the programme." };

  const choice = normaliseConsent({
    share_named_progress: box(formData, "share_named_progress"),
    share_earnings: box(formData, "share_earnings"),
    share_story: box(formData, "share_story"),
  });
  const { error } = await admin.from("programme_consents").insert({
    programme_id: programmeId,
    talent_id: talentId,
    ...choice,
    language: await getLocale(),
    wording_version: CONSENT_WORDING_VERSION,
    guardian_name: parsed.data.guardianName,
    recorded_by: session.userId,
  });
  if (error) return { message: error.message };
  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.PROGRAMME_CONSENT_RECORDED,
    actorId: session.userId,
    subjectId: talentId,
    entityType: "programme_consents",
    entityId: programmeId,
    source: "platform",
    after: { ...choice, guardian: true, wordingVersion: CONSENT_WORDING_VERSION },
  });
  revalidatePath("/operations/settings");
  return { saved: true };
}
