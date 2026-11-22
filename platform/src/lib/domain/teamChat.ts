import { msg } from "@/i18n/config";

/**
 * Team chat (0127). A thread is either a channel ("c:<id>") or a
 * candidate discussion backed by application_notes ("a:<application id>").
 * Pure helpers, tested in teamChat.test.ts.
 */
export type ThreadKey = { kind: "channel"; id: string } | { kind: "application"; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseThreadKey(raw: string | null | undefined): ThreadKey | null {
  if (!raw) return null;
  const [prefix, id] = raw.split(":");
  if (!id || !UUID.test(id)) return null;
  if (prefix === "c") return { kind: "channel", id };
  if (prefix === "a") return { kind: "application", id };
  return null;
}

export function threadKeyString(k: ThreadKey): string {
  return `${k.kind === "channel" ? "c" : "a"}:${k.id}`;
}

export const MAX_MESSAGE_LENGTH = 4000;

/** Trims a message and refuses empty or over-long ones. */
export function cleanMessage(raw: unknown): { ok: true; body: string } | { ok: false; error: string } {
  const body = String(raw ?? "").replace(/\r\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
  if (!body) return { ok: false, error: msg("Write a message first.") };
  if (body.length > MAX_MESSAGE_LENGTH) return { ok: false, error: msg("That message is too long — keep it under 4,000 characters.") };
  return { ok: true, body };
}

/** Messages from other people newer than when this person last read. */
export function countUnread(messages: { sender_id: string; created_at: string }[], me: string, lastReadAt: string | null): number {
  const since = lastReadAt ? new Date(lastReadAt).getTime() : 0;
  return messages.filter((m) => m.sender_id !== me && new Date(m.created_at).getTime() > since).length;
}
