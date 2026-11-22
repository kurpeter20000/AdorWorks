import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMPLOYER_ACCOUNT_ROLES } from "@/lib/domain/roles";

/**
 * New accounts waiting for staff approval (0128), for the Talent and
 * Organisations sections. Read with the admin client — callers must have
 * already checked the staff member works that section.
 */

export type PendingTalent = {
  id: string;
  name: string;
  legalName: string | null;
  headline: string | null;
  category: string | null;
  place: string;
  email: string | null;
  phone: string | null;
  phoneVerified: boolean;
  profileComplete: boolean;
  idSubmitted: boolean;
  signedUpAt: string;
};

export type PendingEmployer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  phoneVerified: boolean;
  organisation: { id: string; name: string; type: string | null; place: string; verification: string } | null;
  signedUpAt: string;
};

type Admin = ReturnType<typeof createAdminClient>;

const placeOf = (r: Record<string, unknown> | undefined | null) =>
  r ? [r.city, r.county, r.state, r.country].filter(Boolean).join(", ") || String(r.location ?? "") : "";

async function emailsFor(admin: Admin, ids: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  await Promise.all(
    ids.map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      out.set(id, data.user?.email ?? null);
    })
  );
  return out;
}

export async function loadPendingTalent(limit = 100): Promise<{ rows: PendingTalent[]; total: number }> {
  const admin = createAdminClient();
  const { data: people, count } = await admin
    .from("profiles")
    .select("id, full_name, phone, phone_verified, created_at", { count: "exact" })
    .eq("role", "talent")
    .eq("approval_status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  const ids = (people ?? []).map((p) => p.id);
  if (!ids.length) return { rows: [], total: count ?? 0 };
  const [{ data: talents }, { data: evidence }, emails] = await Promise.all([
    admin.from("talent_profiles").select("*").in("id", ids),
    admin.from("talent_evidence").select("talent_id, evidence_type").in("talent_id", ids),
    emailsFor(admin, ids),
  ]);
  const rows = (people ?? []).map((p) => {
    const tp = (talents ?? []).find((t) => t.id === p.id) as Record<string, unknown> | undefined;
    return {
      id: p.id,
      name: (tp?.display_name as string) || (tp?.legal_name as string) || p.full_name || "New talent",
      legalName: (tp?.legal_name as string) ?? null,
      headline: (tp?.headline as string) ?? null,
      category: (tp?.category as string) ?? null,
      place: placeOf(tp),
      email: emails.get(p.id) ?? null,
      phone: p.phone,
      phoneVerified: p.phone_verified,
      profileComplete: Boolean(tp?.headline && tp?.bio && ((tp?.skills as string[]) ?? []).length > 0),
      idSubmitted: (evidence ?? []).some((e) => e.talent_id === p.id && e.evidence_type === "identity"),
      signedUpAt: p.created_at,
    };
  });
  return { rows, total: count ?? rows.length };
}

export async function loadPendingEmployers(limit = 100): Promise<{ rows: PendingEmployer[]; total: number }> {
  const admin = createAdminClient();
  const { data: people, count } = await admin
    .from("profiles")
    .select("id, full_name, phone, phone_verified, created_at", { count: "exact" })
    .in("role", [...EMPLOYER_ACCOUNT_ROLES])
    .eq("approval_status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  const ids = (people ?? []).map((p) => p.id);
  if (!ids.length) return { rows: [], total: count ?? 0 };
  const [{ data: members }, emails] = await Promise.all([
    admin.from("organisation_members").select("user_id, organisation_id").in("user_id", ids),
    emailsFor(admin, ids),
  ]);
  const orgIds = [...new Set((members ?? []).map((m) => m.organisation_id))];
  const { data: orgs } = orgIds.length ? await admin.from("organisations").select("*").in("id", orgIds) : { data: [] as Record<string, unknown>[] };
  const rows = (people ?? []).map((p) => {
    const m = (members ?? []).find((x) => x.user_id === p.id);
    const o = m ? ((orgs ?? []) as Record<string, unknown>[]).find((x) => x.id === m.organisation_id) : undefined;
    return {
      id: p.id,
      name: p.full_name || "New employer",
      email: emails.get(p.id) ?? null,
      phone: p.phone,
      phoneVerified: p.phone_verified,
      organisation: o
        ? { id: String(o.id), name: String(o.name), type: (o.org_type as string) ?? null, place: placeOf(o), verification: String(o.verification_status) }
        : null,
      signedUpAt: p.created_at,
    };
  });
  return { rows, total: count ?? rows.length };
}
