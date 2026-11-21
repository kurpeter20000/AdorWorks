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
  const { data: links } = await admin.from("programme_partner_users").select("programme_id").eq("user_id", userId);
  const ids = (links ?? []).map((l) => l.programme_id);
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
