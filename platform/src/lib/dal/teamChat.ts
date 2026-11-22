import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STAFF_ROLES, type VerifiedSession } from "@/lib/dal/session";
import { EMPLOYER_ACCOUNT_ROLES } from "@/lib/domain/roles";
import { countUnread, threadKeyString, type ThreadKey } from "@/lib/domain/teamChat";
import type { TeamChannelRow } from "@/lib/database.types";

/**
 * Team chat (0127) — what each person can see. Every read of channels,
 * messages and candidate notes goes through the signed-in user's own
 * client, so RLS decides access; the admin client is only used afterwards
 * to look up display names and to create an organisation's first channel.
 */

export type ThreadSummary = {
  key: string;
  title: string;
  subtitle: string | null;
  group: string;
  unread: number;
  lastAt: string | null;
  lastPreview: string | null;
};

export type ChatMessage = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  hidden: boolean;
  candidate: { applicationId: string; name: string; job: string; href: string } | null;
};

export type ChatPerson = { name: string; badge: string | null };

export type ThreadDetail = {
  key: string;
  kind: "channel" | "application";
  scope: TeamChannelRow["scope"] | "candidate";
  channelKind: TeamChannelRow["kind"] | null;
  title: string;
  subtitle: string | null;
  /** The cohort a programme channel belongs to. */
  context: string | null;
  href: string | null;
  messages: ChatMessage[];
  people: Record<string, ChatPerson>;
  canPost: boolean;
  canModerate: boolean;
  /** Cohort channels: contact details are blocked (participants may be under 18). */
  safeguarded: boolean;
  /** Employer channels: recent applicants that can be shared as a card. */
  shareableCandidates: { applicationId: string; label: string }[];
};

type Admin = ReturnType<typeof createAdminClient>;

const isStaffRole = (role: string) => (STAFF_ROLES as readonly string[]).includes(role);

async function myOrganisation(userId: string): Promise<{ organisationId: string; role: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("organisation_members").select("organisation_id, role").eq("user_id", userId).maybeSingle();
  return data ? { organisationId: data.organisation_id, role: data.role } : null;
}

/** An organisation's "Team" channel, created the first time anyone opens team chat. */
async function ensureOrganisationChannel(admin: Admin, organisationId: string, userId: string) {
  const { data } = await admin.from("team_channels").select("id").eq("scope", "organisation").eq("organisation_id", organisationId).limit(1);
  if (data && data.length) return;
  await admin.from("team_channels").insert({
    scope: "organisation",
    kind: "general",
    organisation_id: organisationId,
    name: "Team",
    description: "Your organisation's people only",
    created_by: userId,
  });
}

export async function namesFor(admin: Admin, ids: string[]): Promise<Record<string, ChatPerson>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return {};
  const [{ data: people }, { data: talents }] = await Promise.all([
    admin.from("profiles").select("id, full_name, role").in("id", unique),
    admin.from("talent_profiles").select("id, display_name").in("id", unique),
  ]);
  const out: Record<string, ChatPerson> = {};
  for (const p of people ?? []) {
    const t = (talents ?? []).find((x) => x.id === p.id);
    out[p.id] = { name: t?.display_name || p.full_name || "AdorWorks user", badge: isStaffRole(p.role) ? "AdorWorks" : null };
  }
  return out;
}

async function candidateLabels(admin: Admin, applicationIds: string[]) {
  const ids = [...new Set(applicationIds)].filter(Boolean);
  const out = new Map<string, { name: string; job: string; opportunityId: string; headline: string | null }>();
  if (!ids.length) return out;
  const { data: apps } = await admin.from("applications").select("id, talent_id, opportunity_id").in("id", ids);
  const talentIds = (apps ?? []).map((a) => a.talent_id);
  const oppIds = (apps ?? []).map((a) => a.opportunity_id);
  const [names, { data: opps }, { data: talents }] = await Promise.all([
    namesFor(admin, talentIds),
    admin.from("opportunities").select("id, title").in("id", oppIds),
    admin.from("talent_profiles").select("id, headline").in("id", talentIds),
  ]);
  for (const a of apps ?? []) {
    out.set(a.id, {
      name: names[a.talent_id]?.name ?? "Applicant",
      job: (opps ?? []).find((o) => o.id === a.opportunity_id)?.title ?? "Opportunity",
      opportunityId: a.opportunity_id,
      headline: (talents ?? []).find((t) => t.id === a.talent_id)?.headline ?? null,
    });
  }
  return out;
}

/** Every thread this person can open, grouped for the sidebar. */
export async function loadThreads(session: VerifiedSession): Promise<ThreadSummary[]> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const isEmployer = (EMPLOYER_ACCOUNT_ROLES as readonly string[]).includes(session.role);
  const org = isEmployer ? await myOrganisation(session.userId) : null;
  if (org) await ensureOrganisationChannel(admin, org.organisationId, session.userId);

  const [{ data: channels }, { data: reads }] = await Promise.all([
    supabase.from("team_channels").select("*").is("archived_at", null).order("created_at", { ascending: true }),
    supabase.from("team_chat_reads").select("thread_key, last_read_at").eq("user_id", session.userId),
  ]);
  const lastRead = new Map((reads ?? []).map((r) => [r.thread_key, r.last_read_at]));

  const channelIds = (channels ?? []).map((c) => c.id);
  const { data: recent } = channelIds.length
    ? await supabase
        .from("team_messages")
        .select("channel_id, sender_id, body, created_at, hidden_at")
        .in("channel_id", channelIds)
        .order("created_at", { ascending: false })
        .limit(1500)
    : { data: [] as { channel_id: string; sender_id: string; body: string; created_at: string; hidden_at: string | null }[] };

  const programmeIds = [...new Set((channels ?? []).map((c) => c.programme_id).filter(Boolean) as string[])];
  const { data: programmes } = programmeIds.length
    ? await admin.from("programmes").select("id, name").in("id", programmeIds)
    : { data: [] as { id: string; name: string }[] };

  const threads: ThreadSummary[] = (channels ?? []).map((c) => {
    const key = threadKeyString({ kind: "channel", id: c.id });
    const mine = (recent ?? []).filter((m) => m.channel_id === c.id);
    const last = mine[0];
    const group =
      c.scope === "staff"
        ? "AdorWorks staff"
        : c.scope === "organisation"
          ? "Your team"
          : (programmes ?? []).find((p) => p.id === c.programme_id)?.name ?? "Pathways";
    return {
      key,
      title: c.name,
      subtitle: c.description,
      group,
      unread: countUnread(mine, session.userId, lastRead.get(key) ?? null),
      lastAt: last?.created_at ?? null,
      lastPreview: last ? (last.hidden_at ? "Message removed" : last.body.slice(0, 90)) : null,
    };
  });

  // Candidate discussions: the team's notes on applicants (write members only; RLS).
  if (org && org.role !== "viewer") {
    const { data: opps } = await supabase.from("opportunities").select("id").eq("organisation_id", org.organisationId).limit(500);
    const oppIds = (opps ?? []).map((o) => o.id);
    const { data: apps } = oppIds.length
      ? await supabase.from("applications").select("id").in("opportunity_id", oppIds).limit(2000)
      : { data: [] as { id: string }[] };
    const appIds = (apps ?? []).map((a) => a.id);
    const { data: notes } = appIds.length
      ? await supabase
          .from("application_notes")
          .select("application_id, author_id, body, created_at")
          .in("application_id", appIds)
          .order("created_at", { ascending: false })
          .limit(1000)
      : { data: [] as { application_id: string; author_id: string; body: string; created_at: string }[] };
    const byApp = new Map<string, NonNullable<typeof notes>>();
    for (const n of notes ?? []) byApp.set(n.application_id, [...(byApp.get(n.application_id) ?? []), n]);
    const top = [...byApp.keys()].slice(0, 40);
    const labels = await candidateLabels(admin, top);
    for (const appId of top) {
      const list = byApp.get(appId)!;
      const key = threadKeyString({ kind: "application", id: appId });
      const label = labels.get(appId);
      threads.push({
        key,
        title: label?.name ?? "Applicant",
        subtitle: label ? `Applied for ${label.job}` : null,
        group: "Candidates",
        unread: countUnread(list.map((n) => ({ sender_id: n.author_id, created_at: n.created_at })), session.userId, lastRead.get(key) ?? null),
        lastAt: list[0]?.created_at ?? null,
        lastPreview: list[0]?.body.slice(0, 90) ?? null,
      });
    }
  }
  return threads;
}

async function canModerateChannel(admin: Admin, session: VerifiedSession, c: TeamChannelRow): Promise<boolean> {
  if (isStaffRole(session.role)) return c.scope !== "organisation" ? true : false;
  if (c.scope === "organisation" && c.organisation_id) {
    const { data: m } = await admin
      .from("organisation_members")
      .select("role")
      .eq("organisation_id", c.organisation_id)
      .eq("user_id", session.userId)
      .maybeSingle();
    const { data: o } = await admin.from("organisations").select("representative_id").eq("id", c.organisation_id).maybeSingle();
    return m?.role === "admin" || o?.representative_id === session.userId;
  }
  if (c.scope === "programme" && c.programme_id) {
    const [{ data: p }, { data: f }] = await Promise.all([
      admin.from("programme_partner_users").select("user_id").eq("programme_id", c.programme_id).eq("user_id", session.userId).maybeSingle(),
      admin.from("programme_facilitators").select("user_id").eq("programme_id", c.programme_id).eq("user_id", session.userId).maybeSingle(),
    ]);
    return Boolean(p || f);
  }
  return false;
}

/** One thread with its latest messages, or null if this person can't see it. */
export async function loadThread(session: VerifiedSession, key: ThreadKey): Promise<ThreadDetail | null> {
  const supabase = await createClient();
  const admin = createAdminClient();

  if (key.kind === "channel") {
    const { data: c } = await supabase.from("team_channels").select("*").eq("id", key.id).maybeSingle();
    if (!c) return null;
    const { data: rows } = await supabase
      .from("team_messages")
      .select("*")
      .eq("channel_id", c.id)
      .order("created_at", { ascending: false })
      .limit(200);
    const messagesDesc = rows ?? [];
    const labels = await candidateLabels(admin, messagesDesc.map((m) => m.application_id).filter(Boolean) as string[]);
    const people = await namesFor(admin, messagesDesc.map((m) => m.sender_id).concat(session.userId));

    let shareableCandidates: ThreadDetail["shareableCandidates"] = [];
    if (c.scope === "organisation" && c.organisation_id) {
      const { data: opps } = await supabase.from("opportunities").select("id").eq("organisation_id", c.organisation_id).limit(500);
      const oppIds = (opps ?? []).map((o) => o.id);
      const { data: apps } = oppIds.length
        ? await supabase.from("applications").select("id").in("opportunity_id", oppIds).order("created_at", { ascending: false }).limit(60)
        : { data: [] as { id: string }[] };
      const l = await candidateLabels(admin, (apps ?? []).map((a) => a.id));
      shareableCandidates = (apps ?? []).map((a) => ({ applicationId: a.id, label: `${l.get(a.id)?.name ?? "Applicant"} — ${l.get(a.id)?.job ?? ""}` }));
    }

    const programmeName = c.programme_id ? (await admin.from("programmes").select("name").eq("id", c.programme_id).maybeSingle()).data?.name : null;
    return {
      key: threadKeyString(key),
      kind: "channel",
      scope: c.scope,
      channelKind: c.kind,
      title: c.name,
      subtitle: c.description,
      context: programmeName ?? null,
      href: c.programme_id && c.kind === "team" ? `/partner/${c.programme_id}` : null,
      messages: messagesDesc.reverse().map((m) => {
        const l = m.application_id ? labels.get(m.application_id) : null;
        return {
          id: m.id,
          senderId: m.sender_id,
          body: m.hidden_at ? "" : m.body,
          createdAt: m.created_at,
          hidden: Boolean(m.hidden_at),
          candidate:
            l && m.application_id && !m.hidden_at
              ? { applicationId: m.application_id, name: l.name, job: l.job, href: `/team-chat?t=a:${m.application_id}` }
              : null,
        };
      }),
      people,
      canPost: !c.archived_at,
      canModerate: await canModerateChannel(admin, session, c),
      safeguarded: c.scope === "programme" && c.kind === "cohort",
      shareableCandidates,
    };
  }

  // Candidate discussion: the applicant's team notes (RLS: the org's write members and staff).
  const { data: app } = await supabase.from("applications").select("id, talent_id, opportunity_id").eq("id", key.id).maybeSingle();
  if (!app) return null;
  const { data: notes, error } = await supabase
    .from("application_notes")
    .select("id, author_id, body, created_at")
    .eq("application_id", app.id)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) return null;
  const labels = await candidateLabels(admin, [app.id]);
  const l = labels.get(app.id);
  const people = await namesFor(admin, (notes ?? []).map((n) => n.author_id).concat(session.userId));
  const org = await myOrganisation(session.userId);
  return {
    key: threadKeyString(key),
    kind: "application",
    scope: "candidate",
    channelKind: null,
    title: l?.name ?? "Applicant",
    subtitle: l?.headline ?? null,
    context: l ? l.job : null,
    href: `/organisation/opportunities/${app.opportunity_id}`,
    messages: (notes ?? []).map((n) => ({ id: n.id, senderId: n.author_id, body: n.body, createdAt: n.created_at, hidden: false, candidate: null })),
    people,
    canPost: Boolean(org && org.role !== "viewer"),
    canModerate: false,
    safeguarded: false,
    shareableCandidates: [],
  };
}

/** Organisation admins (for their team) and AdorWorks admins (for staff) can add channels. */
export async function canCreateChannels(session: VerifiedSession): Promise<boolean> {
  if (session.role === "admin") return true;
  if (!(EMPLOYER_ACCOUNT_ROLES as readonly string[]).includes(session.role)) return false;
  const org = await myOrganisation(session.userId);
  if (!org) return false;
  if (org.role === "admin") return true;
  const { data } = await createAdminClient().from("organisations").select("representative_id").eq("id", org.organisationId).maybeSingle();
  return data?.representative_id === session.userId;
}
