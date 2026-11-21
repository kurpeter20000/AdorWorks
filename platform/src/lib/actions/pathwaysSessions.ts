"use server";

import { z } from "zod";
import { randomInt } from "crypto";
import { revalidatePath } from "next/cache";
import { requireRole, requireSession, CLIENT_ROLES } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { canRunSessions } from "@/lib/dal/pathways";
import { newJoinCode } from "@/lib/domain/pathways";
import { normalisePhone } from "@/lib/domain/payoutMethods";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";
import { notifyUser, NOTIFICATION_TYPES } from "@/lib/domain/notifications";
import { msg } from "@/i18n/config";
import type { FormState } from "./auth";

/**
 * Pathways, part 2 (0123). Sessions and attendance, facilitators,
 * certificates and Internship Bridge reviews. Facilitators never get a
 * list of participants' names: people check in themselves with the
 * session code, or a facilitator marks one person present by phone.
 */
type Admin = ReturnType<typeof createAdminClient>;
const STAFF_PROGRAMME_ROLES = ["admin", "finance"] as const;

async function requireSessionRunner(programmeId: string) {
  const session = await requireSession();
  if (!(await canRunSessions(session.userId, session.role, programmeId))) {
    return { error: "Only AdorWorks staff or a facilitator with a recorded background check can do this." } as const;
  }
  return { session } as const;
}

/** A programme member found by phone number, or null. */
async function memberByPhone(admin: Admin, programmeId: string, raw: string): Promise<string | null> {
  const phone = normalisePhone(raw);
  if (!phone) return null;
  const { data: people } = await admin.from("profiles").select("id").eq("phone", phone).limit(5);
  const ids = (people ?? []).map((p) => p.id);
  if (!ids.length) return null;
  const { data: member } = await admin.from("programme_members").select("talent_id").eq("programme_id", programmeId).in("talent_id", ids).limit(1);
  return member?.[0]?.talent_id ?? null;
}

// --- Facilitators (staff) ----------------------------------------------------

export async function addFacilitator(programmeId: string, _prev: FormState, formData: FormData): Promise<FormState & { saved?: boolean }> {
  const session = await requireRole(...STAFF_PROGRAMME_ROLES);
  const raw = String(formData.get("account") ?? "").trim();
  const admin = createAdminClient();
  const phone = raw.includes("@") ? null : normalisePhone(raw);
  let userId: string | null = null;
  if (phone) userId = (await admin.from("profiles").select("id").eq("phone", phone).limit(1)).data?.[0]?.id ?? null;
  if (!userId && raw.includes("@")) {
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) break;
      userId = data.users.find((u) => u.email?.toLowerCase() === raw.toLowerCase())?.id ?? null;
      if (data.users.length < 200) break;
    }
  }
  if (!userId) return { errors: { account: ["No AdorWorks account uses that email or phone. Ask them to create one first."] } };
  const { error } = await admin.from("programme_facilitators").upsert({ programme_id: programmeId, user_id: userId }, { onConflict: "programme_id,user_id", ignoreDuplicates: true });
  if (error) return { message: error.message };
  await logAuditEvent(admin, { name: DOMAIN_EVENTS.PROGRAMME_UPDATED, actorId: session.userId, subjectId: userId, entityType: "programme_facilitators", entityId: programmeId, source: "platform", after: { facilitatorAdded: true } });
  revalidatePath("/operations/settings");
  return { saved: true };
}

const CheckSchema = z.object({ note: z.string().trim().min(5, "Say what was checked and when (e.g. police clearance seen 3 Jan).").max(500) });

/** Staff: a background check was done. Only then can the facilitator run sessions (safeguarding). */
export async function recordBackgroundCheck(programmeId: string, userId: string, _prev: FormState, formData: FormData): Promise<FormState & { saved?: boolean }> {
  const session = await requireRole(...STAFF_PROGRAMME_ROLES);
  const parsed = CheckSchema.safeParse({ note: formData.get("note") ?? "" });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const admin = createAdminClient();
  const { error } = await admin
    .from("programme_facilitators")
    .update({ background_check_recorded_at: new Date().toISOString(), background_check_note: parsed.data.note, recorded_by: session.userId })
    .eq("programme_id", programmeId)
    .eq("user_id", userId);
  if (error) return { message: error.message };
  await logAuditEvent(admin, { name: DOMAIN_EVENTS.PROGRAMME_UPDATED, actorId: session.userId, subjectId: userId, entityType: "programme_facilitators", entityId: programmeId, source: "platform", reason: parsed.data.note, after: { backgroundCheckRecorded: true } });
  revalidatePath("/operations/settings");
  return { saved: true };
}

// --- Sessions (facilitators and staff) ----------------------------------------

const SessionSchema = z.object({
  title: z.string().trim().min(2, "Give the session a title.").max(160),
  startsAt: z.string().trim().min(10, "Choose a date and time."),
  location: z.string().trim().max(160),
});

export async function createSession(programmeId: string, _prev: FormState, formData: FormData): Promise<FormState & { saved?: boolean }> {
  const gate = await requireSessionRunner(programmeId);
  if ("error" in gate) return { message: gate.error };
  const parsed = SessionSchema.safeParse({ title: formData.get("title") ?? "", startsAt: formData.get("startsAt") ?? "", location: formData.get("location") ?? "" });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const startsAt = new Date(parsed.data.startsAt);
  if (Number.isNaN(startsAt.getTime())) return { errors: { startsAt: ["Choose a date and time."] } };
  const admin = createAdminClient();
  for (let attempt = 0; attempt < 4; attempt++) {
    const { error } = await admin.from("programme_sessions").insert({
      programme_id: programmeId,
      title: parsed.data.title,
      starts_at: startsAt.toISOString(),
      location: parsed.data.location || null,
      checkin_code: newJoinCode("IN", randomInt),
      created_by: gate.session.userId,
    });
    if (!error) {
      revalidatePath(`/partner/${programmeId}/sessions`);
      return { saved: true };
    }
    if (error.code !== "23505") return { message: error.message };
  }
  return { message: "Could not create a check-in code. Please try again." };
}

export async function setCheckinOpen(sessionId: string, open: boolean): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const { data: s } = await admin.from("programme_sessions").select("programme_id").eq("id", sessionId).maybeSingle();
  if (!s) return { error: "Session not found." };
  const gate = await requireSessionRunner(s.programme_id);
  if ("error" in gate) return { error: gate.error };
  const { error } = await admin.from("programme_sessions").update({ checkin_open: open }).eq("id", sessionId);
  if (error) return { error: error.message };
  revalidatePath(`/partner/${s.programme_id}/sessions`);
  return {};
}

/** Facilitator marks one participant present by their phone number (e.g. no smartphone with them). */
export async function markAttendanceByPhone(sessionId: string, _prev: FormState, formData: FormData): Promise<FormState & { saved?: boolean }> {
  const admin = createAdminClient();
  const { data: s } = await admin.from("programme_sessions").select("programme_id").eq("id", sessionId).maybeSingle();
  if (!s) return { message: "Session not found." };
  const gate = await requireSessionRunner(s.programme_id);
  if ("error" in gate) return { message: gate.error };
  const talentId = await memberByPhone(admin, s.programme_id, String(formData.get("phone") ?? ""));
  if (!talentId) return { errors: { phone: ["No participant in this programme uses that phone number."] } };
  const { error } = await admin
    .from("programme_attendance")
    .upsert({ session_id: sessionId, talent_id: talentId, method: "facilitator", marked_by: gate.session.userId }, { onConflict: "session_id,talent_id", ignoreDuplicates: true });
  if (error) return { message: error.message };
  revalidatePath(`/partner/${s.programme_id}/sessions`);
  return { saved: true };
}

/** Facilitator or staff: a participant has finished the programme. */
export async function issueCertificateByPhone(programmeId: string, _prev: FormState, formData: FormData): Promise<FormState & { saved?: boolean; code?: string }> {
  const gate = await requireSessionRunner(programmeId);
  if ("error" in gate) return { message: gate.error };
  const admin = createAdminClient();
  const talentId = await memberByPhone(admin, programmeId, String(formData.get("phone") ?? ""));
  if (!talentId) return { errors: { phone: ["No participant in this programme uses that phone number."] } };
  const { data: existing } = await admin.from("programme_certificates").select("check_code").eq("programme_id", programmeId).eq("talent_id", talentId).maybeSingle();
  if (existing) return { saved: true, code: existing.check_code };
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = newJoinCode("CERT", randomInt) + newJoinCode("", randomInt).slice(-4);
    const { error } = await admin.from("programme_certificates").insert({ programme_id: programmeId, talent_id: talentId, check_code: code, issued_by: gate.session.userId });
    if (!error) {
      await logAuditEvent(admin, { name: DOMAIN_EVENTS.PROGRAMME_UPDATED, actorId: gate.session.userId, subjectId: talentId, entityType: "programme_certificates", entityId: programmeId, source: "platform", after: { certificate: code } });
      await notifyUser(admin, {
        userId: talentId,
        type: NOTIFICATION_TYPES.CERTIFICATE_ISSUED,
        title: "You've earned a certificate",
        body: `Your Pathways certificate is on your Passport. Anyone can check it with the code ${code}.`,
        link: "/passport",
        dedupeKey: `${programmeId}:${talentId}`,
      });
      revalidatePath(`/partner/${programmeId}/sessions`);
      return { saved: true, code };
    }
    if (error.code !== "23505") return { message: error.message };
  }
  return { message: "Could not issue the certificate. Please try again." };
}

// --- Participants -------------------------------------------------------------

const CheckinSchema = z.object({ code: z.string().trim().min(4, msg("Enter the code shown at the session.")).max(24) });

/** Talent: check in to a session with its code (QR). Also enrols them in the cohort if they weren't yet. */
export async function checkInToSession(_prev: FormState, formData: FormData): Promise<FormState & { sessionId?: string; title?: string }> {
  const session = await requireRole("talent");
  const parsed = CheckinSchema.safeParse({ code: formData.get("code") ?? "" });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const admin = createAdminClient();
  const code = parsed.data.code.toUpperCase().replace(/\s+/g, "");
  const { data: s } = await admin.from("programme_sessions").select("id, programme_id, title, checkin_open").eq("checkin_code", code).maybeSingle();
  if (!s) return { errors: { code: [msg("That code doesn't match a session. Check it with your facilitator.")] } };
  if (!s.checkin_open) return { message: msg("Check-in for this session has closed. Ask your facilitator to mark you present.") };
  await admin.from("programme_members").upsert({ programme_id: s.programme_id, talent_id: session.userId, joined_via: "code" }, { onConflict: "programme_id,talent_id", ignoreDuplicates: true });
  const { error } = await admin
    .from("programme_attendance")
    .upsert({ session_id: s.id, talent_id: session.userId, method: "code" }, { onConflict: "session_id,talent_id", ignoreDuplicates: true });
  if (error) return { message: error.message };
  return { sessionId: s.id, title: s.title };
}

/** Talent: rate a session they attended (1–5). */
export async function rateSession(sessionId: string, score: number): Promise<{ error?: string }> {
  const session = await requireRole("talent");
  if (!Number.isInteger(score) || score < 1 || score > 5) return { error: msg("Choose 1 to 5.") };
  const admin = createAdminClient();
  const { data, error } = await admin.from("programme_attendance").update({ feedback_score: score }).eq("session_id", sessionId).eq("talent_id", session.userId).select("session_id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: msg("Check in to the session first.") };
  return {};
}

// --- Internship Bridge ------------------------------------------------------------

const InternReviewSchema = z.object({
  stage: z.enum(["mid_point", "final"]),
  score_skills: z.coerce.number().int().min(1).max(5),
  score_reliability: z.coerce.number().int().min(1).max(5),
  score_growth: z.coerce.number().int().min(1).max(5),
  strengths: z.string().trim().max(2000),
  to_improve: z.string().trim().max(2000),
});

/** Employer (the intern's supervisor): mid-point and final reviews on an internship contract. */
export async function submitInternshipReview(contractId: string, _prev: FormState, formData: FormData): Promise<FormState & { saved?: boolean }> {
  const session = await requireRole(...CLIENT_ROLES);
  const parsed = InternReviewSchema.safeParse({
    stage: formData.get("stage"),
    score_skills: formData.get("score_skills"),
    score_reliability: formData.get("score_reliability"),
    score_growth: formData.get("score_growth"),
    strengths: formData.get("strengths") ?? "",
    to_improve: formData.get("to_improve") ?? "",
  });
  if (!parsed.success) return { message: msg("Answer each question.") };
  const admin = createAdminClient();
  const { data: contract } = await admin.from("contracts").select("id, organisation_id, talent_id, opportunity_id").eq("id", contractId).maybeSingle();
  if (!contract) return { message: msg("Contract not found.") };
  const { data: member } = await admin.from("organisation_members").select("role").eq("organisation_id", contract.organisation_id).eq("user_id", session.userId).maybeSingle();
  if (!member || member.role === "viewer") return { message: msg("You don't have permission to manage this contract.") };
  const { data: opp } = contract.opportunity_id ? await admin.from("opportunities").select("engagement_type").eq("id", contract.opportunity_id).maybeSingle() : { data: null };
  if (opp?.engagement_type !== "internship") return { message: msg("Supervisor reviews are only for internships.") };

  const v = parsed.data;
  const { error } = await admin.from("internship_reviews").insert({
    contract_id: contractId,
    stage: v.stage,
    supervisor_id: session.userId,
    score_skills: v.score_skills,
    score_reliability: v.score_reliability,
    score_growth: v.score_growth,
    strengths: v.strengths || null,
    to_improve: v.to_improve || null,
  });
  if (error) {
    if (error.code === "23505") return { message: msg("This review has already been written.") };
    return { message: error.message };
  }
  await notifyUser(admin, {
    userId: contract.talent_id,
    type: NOTIFICATION_TYPES.REVIEW_RECEIVED,
    title: v.stage === "final" ? "Your final internship review is ready" : "Your mid-point internship review is ready",
    link: `/contracts/${contractId}`,
    dedupeKey: `${contractId}:${v.stage}`,
  });
  revalidatePath(`/contracts/${contractId}`);
  return { saved: true };
}
