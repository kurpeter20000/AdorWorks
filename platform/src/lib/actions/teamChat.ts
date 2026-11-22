"use server";

import { revalidatePath } from "next/cache";
import { msg } from "@/i18n/config";
import { requireSession, STAFF_ROLES } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";
import { cleanMessage, parseThreadKey } from "@/lib/domain/teamChat";
import { containsContactDetails } from "@/lib/domain/messageFilter";

export type PostResult = {
  error?: string;
  message?: { id: string; senderId: string; body: string; createdAt: string; applicationId: string | null };
};

/**
 * Sends a message to a team chat thread (0127). RLS decides who may post
 * where; this adds the app rules: tidy text, and no phone numbers,
 * emails or messaging handles in Pathways cohort chats (participants can
 * be under 18).
 */
export async function postTeamMessage(threadKey: string, body: string, applicationId?: string | null): Promise<PostResult> {
  const session = await requireSession();
  const key = parseThreadKey(threadKey);
  if (!key) return { error: msg("This conversation doesn't exist.") };
  const cleaned = cleanMessage(body);
  if (!cleaned.ok) return { error: cleaned.error };
  const supabase = await createClient();

  if (key.kind === "application") {
    const { data, error } = await supabase
      .from("application_notes")
      .insert({ application_id: key.id, author_id: session.userId, body: cleaned.body })
      .select("id, author_id, body, created_at")
      .single();
    if (error || !data) return { error: msg("You can't post in this discussion.") };
    return { message: { id: data.id, senderId: data.author_id, body: data.body, createdAt: data.created_at, applicationId: null } };
  }

  const { data: channel } = await supabase.from("team_channels").select("id, scope, kind").eq("id", key.id).maybeSingle();
  if (!channel) return { error: msg("This conversation doesn't exist.") };
  if (channel.scope === "programme" && channel.kind === "cohort" && containsContactDetails(cleaned.body)) {
    return { error: msg("To keep everyone safe, phone numbers, emails and messaging handles can't be shared in the cohort chat.") };
  }
  const { data, error } = await supabase
    .from("team_messages")
    .insert({
      channel_id: channel.id,
      sender_id: session.userId,
      body: cleaned.body,
      application_id: channel.scope === "organisation" && applicationId ? applicationId : null,
    })
    .select("id, sender_id, body, created_at, application_id")
    .single();
  if (error || !data) return { error: msg("Couldn't send — you may not have access to this chat.") };
  return { message: { id: data.id, senderId: data.sender_id, body: data.body, createdAt: data.created_at, applicationId: data.application_id } };
}

/** Remembers how far this person has read a thread (for unread counts). */
export async function markThreadRead(threadKey: string): Promise<void> {
  const session = await requireSession();
  if (!parseThreadKey(threadKey)) return;
  const supabase = await createClient();
  await supabase
    .from("team_chat_reads")
    .upsert({ user_id: session.userId, thread_key: threadKey, last_read_at: new Date().toISOString() }, { onConflict: "user_id,thread_key" });
}

/**
 * Moderators hide a message (kept for safeguarding, shown as removed):
 * AdorWorks staff in staff and Pathways chats, partner staff and
 * facilitators in their cohort's chats, and organisation admins in their
 * own team's chats.
 */
export async function hideTeamMessage(messageId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const supabase = await createClient();
  const { data: m } = await supabase.from("team_messages").select("id, channel_id, sender_id").eq("id", messageId).maybeSingle();
  if (!m) return { error: msg("Message not found.") };
  const admin = createAdminClient();
  const { data: c } = await admin.from("team_channels").select("*").eq("id", m.channel_id).maybeSingle();
  if (!c) return { error: msg("Message not found.") };

  let allowed = false;
  if ((STAFF_ROLES as readonly string[]).includes(session.role) && c.scope !== "organisation") allowed = true;
  else if (c.scope === "organisation" && c.organisation_id) {
    const [{ data: mem }, { data: org }] = await Promise.all([
      admin.from("organisation_members").select("role").eq("organisation_id", c.organisation_id).eq("user_id", session.userId).maybeSingle(),
      admin.from("organisations").select("representative_id").eq("id", c.organisation_id).maybeSingle(),
    ]);
    allowed = mem?.role === "admin" || org?.representative_id === session.userId;
  } else if (c.scope === "programme" && c.programme_id) {
    const [{ data: p }, { data: f }] = await Promise.all([
      admin.from("programme_partner_users").select("user_id").eq("programme_id", c.programme_id).eq("user_id", session.userId).maybeSingle(),
      admin.from("programme_facilitators").select("user_id").eq("programme_id", c.programme_id).eq("user_id", session.userId).maybeSingle(),
    ]);
    allowed = Boolean(p || f);
  }
  if (!allowed) return { error: msg("Only moderators can remove messages.") };

  const { error } = await admin.from("team_messages").update({ hidden_at: new Date().toISOString(), hidden_by: session.userId }).eq("id", m.id);
  if (error) return { error: msg("Couldn't remove the message.") };
  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.TEAM_MESSAGE_HIDDEN,
    actorId: session.userId,
    subjectId: m.sender_id,
    entityType: "team_messages",
    entityId: m.id,
    source: "platform",
  });
  revalidatePath("/team-chat");
  return {};
}

/** Organisation admins add channels for their team; AdorWorks admins add staff channels. */
export async function createTeamChannel(name: string, description: string): Promise<{ error?: string; key?: string }> {
  const session = await requireSession();
  const n = name.replace(/\s+/g, " ").trim();
  if (n.length < 2 || n.length > 60) return { error: msg("Give the channel a name of 2 to 60 characters.") };
  const d = description.trim().slice(0, 200) || null;
  const admin = createAdminClient();

  if (session.role === "admin") {
    const { data, error } = await admin.from("team_channels").insert({ scope: "staff", name: n, description: d, created_by: session.userId }).select("id").single();
    if (error || !data) return { error: msg("A channel with that name may already exist.") };
    revalidatePath("/team-chat");
    return { key: `c:${data.id}` };
  }

  const supabase = await createClient();
  const { data: mem } = await supabase.from("organisation_members").select("organisation_id, role").eq("user_id", session.userId).maybeSingle();
  if (!mem) return { error: msg("Only organisation admins can add channels.") };
  const { data: org } = await admin.from("organisations").select("representative_id").eq("id", mem.organisation_id).maybeSingle();
  if (mem.role !== "admin" && org?.representative_id !== session.userId) return { error: msg("Only organisation admins can add channels.") };
  const { data, error } = await admin
    .from("team_channels")
    .insert({ scope: "organisation", kind: "general", organisation_id: mem.organisation_id, name: n, description: d, created_by: session.userId })
    .select("id")
    .single();
  if (error || !data) return { error: msg("A channel with that name may already exist.") };
  revalidatePath("/team-chat");
  return { key: `c:${data.id}` };
}
