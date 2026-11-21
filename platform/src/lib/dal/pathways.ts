import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { STAFF_ROLES } from "@/lib/dal/session";
import type { ProgrammeRow, UserRole } from "@/lib/database.types";
import type { ParticipantFacts } from "@/lib/domain/pathways";

type Admin = ReturnType<typeof createAdminClient>;

/** Programmes this person may open on the partner dashboard: staff see all, partner users only their own. */
export async function partnerProgrammesFor(userId: string, role: UserRole): Promise<ProgrammeRow[]> {
  const admin = createAdminClient();
  if (STAFF_ROLES.includes(role)) {
    const { data } = await admin.from("programmes").select("*").order("created_at", { ascending: false });
    return data ?? [];
  }
  // Partner staff, facilitators (0123), and admins of the partner
  // organisation that owns the cohort (0124) all open the partner dashboard.
  const [{ data: links }, { data: facil }, orgIds] = await Promise.all([
    admin.from("programme_partner_users").select("programme_id").eq("user_id", userId),
    admin.from("programme_facilitators").select("programme_id").eq("user_id", userId),
    partnerOrgsAdminedBy(userId),
  ]);
  const { data: owned } = orgIds.length
    ? await admin.from("programmes").select("id").in("partner_organisation_id", orgIds)
    : { data: [] as { id: string }[] };
  const ids = [...new Set([...(links ?? []), ...(facil ?? [])].map((l) => l.programme_id).concat((owned ?? []).map((o) => o.id)))];
  if (!ids.length) return [];
  const { data } = await admin.from("programmes").select("*").in("id", ids).order("created_at", { ascending: false });
  return data ?? [];
}

/**
 * Everything the partner report needs about each participant, read with
 * the admin client AFTER access has been checked. The privacy floor is
 * applied afterwards by buildPartnerReport() — nothing here is ever sent
 * to a partner directly.
 */
export async function loadParticipantFacts(admin: Admin, programmeId: string): Promise<ParticipantFacts[]> {
  const { data: members } = await admin.from("programme_members").select("talent_id, is_minor, joined_at").eq("programme_id", programmeId);
  const ids = (members ?? []).map((m) => m.talent_id);
  if (!ids.length) return [];

  const [{ data: profiles }, { data: people }, { data: evidence }, { data: apps }, { data: contracts }, { data: consents }] = await Promise.all([
    admin.from("talent_profiles").select("id, display_name, headline, bio, skills, location, category, verification_tier").in("id", ids),
    admin.from("profiles").select("id, full_name").in("id", ids),
    admin.from("talent_evidence").select("talent_id, evidence_type").in("talent_id", ids).eq("status", "approved"),
    admin.from("applications").select("talent_id, stage").in("talent_id", ids).in("stage", ["shortlisted", "interviewing", "offered", "accepted"]),
    admin.from("contracts").select("id, talent_id").in("talent_id", ids),
    admin
      .from("programme_consents")
      .select("talent_id, share_named_progress, share_earnings, share_story, guardian_name, created_at")
      .eq("programme_id", programmeId)
      .in("talent_id", ids)
      .order("created_at", { ascending: false }),
  ]);
  const contractIds = (contracts ?? []).map((c) => c.id);
  const { data: payments } = contractIds.length
    ? await admin.from("payment_events").select("contract_id, net_amount, currency, created_at").in("contract_id", contractIds).eq("status", "succeeded")
    : { data: [] as { contract_id: string; net_amount: number; currency: string; created_at: string }[] };
  const talentByContract = new Map((contracts ?? []).map((c) => [c.id, c.talent_id]));

  return (members ?? []).map((m) => {
    const tp = (profiles ?? []).find((p) => p.id === m.talent_id);
    const own = (payments ?? []).filter((p) => talentByContract.get(p.contract_id) === m.talent_id);
    const earnings: Record<string, number> = {};
    for (const p of own) earnings[p.currency] = Math.round(((earnings[p.currency] ?? 0) + Number(p.net_amount)) * 100) / 100;
    const firstPaid = own.map((p) => p.created_at).sort()[0] ?? null;
    const c = (consents ?? []).find((x) => x.talent_id === m.talent_id);
    return {
      talentId: m.talent_id,
      name: tp?.display_name || (people ?? []).find((p) => p.id === m.talent_id)?.full_name || "Participant",
      isMinor: m.is_minor,
      joinedAt: m.joined_at,
      tier: tp?.verification_tier ?? "registered",
      passportComplete: Boolean(tp?.headline && tp?.bio && (tp?.skills ?? []).length > 0),
      portfolioReviewed: (evidence ?? []).some((e) => e.talent_id === m.talent_id && e.evidence_type === "portfolio"),
      location: tp?.location ?? null,
      category: tp?.category ?? null,
      matched: (apps ?? []).some((a) => a.talent_id === m.talent_id),
      placed: (contracts ?? []).some((x) => x.talent_id === m.talent_id),
      firstPaidAt: firstPaid,
      earnings,
      consent: c ? { named: c.share_named_progress, earnings: c.share_earnings, story: c.share_story, guardian: c.guardian_name } : null,
    };
  });
}

/** Staff, or a facilitator whose background check has been recorded, may run this cohort's sessions. */
export async function canRunSessions(userId: string, role: UserRole, programmeId: string): Promise<boolean> {
  if (STAFF_ROLES.includes(role)) return true;
  const admin = createAdminClient();
  const { data } = await admin
    .from("programme_facilitators")
    .select("background_check_recorded_at")
    .eq("programme_id", programmeId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data?.background_check_recorded_at);
}

/** Approved partner organisations (0124) where this person is an organisation admin. */
export async function partnerOrgsAdminedBy(userId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data: memberships } = await admin.from("organisation_members").select("organisation_id").eq("user_id", userId).eq("role", "admin");
  const ids = (memberships ?? []).map((m) => m.organisation_id);
  if (!ids.length) return [];
  const { data: orgs } = await admin.from("organisations").select("id").in("id", ids).eq("is_programme_partner", true);
  return (orgs ?? []).map((o) => o.id);
}

/** May manage this cohort and its team: staff, a partner admin of the cohort, or an admin of its partner organisation. */
export async function canManageCohort(userId: string, role: UserRole, programmeId: string): Promise<boolean> {
  if (STAFF_ROLES.includes(role)) return true;
  const admin = createAdminClient();
  const [{ data: link }, { data: programme }] = await Promise.all([
    admin.from("programme_partner_users").select("role").eq("programme_id", programmeId).eq("user_id", userId).maybeSingle(),
    admin.from("programmes").select("partner_organisation_id").eq("id", programmeId).maybeSingle(),
  ]);
  if (link?.role === "admin") return true;
  if (!programme?.partner_organisation_id) return false;
  return (await partnerOrgsAdminedBy(userId)).includes(programme.partner_organisation_id);
}
