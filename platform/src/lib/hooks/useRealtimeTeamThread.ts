"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessage } from "@/lib/dal/teamChat";

/**
 * Keeps a team chat thread live (0127): new messages stream in over
 * Supabase Realtime — team_messages for channels, application_notes for
 * candidate discussions — and a moderator hiding a message updates in
 * place. RLS decides which rows each subscriber receives, exactly as for
 * reads. Same session-before-subscribe handling as useRealtimeMessages.
 *
 * A message from someone this page hasn't seen yet (no name loaded), or a
 * shared candidate card, triggers a refresh so names and cards come from
 * the server rather than being guessed here.
 */
export function useRealtimeTeamThread(
  thread: { kind: "channel" | "application"; id: string },
  initial: ChatMessage[],
  knownPeople: Record<string, unknown>
) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [seenInitial, setSeenInitial] = useState(initial);
  const router = useRouter();

  // After a refresh the server's copy wins for every message it has
  // (names, candidate cards, hidden state); anything newer that arrived
  // live in between is kept. React's "adjust state when a prop changes".
  if (initial !== seenInitial) {
    setSeenInitial(initial);
    const fromServer = new Map(initial.map((m) => [m.id, m]));
    const extra = messages.filter((m) => !fromServer.has(m.id));
    setMessages([...initial, ...extra].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  }

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) await supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      const table = thread.kind === "channel" ? "team_messages" : "application_notes";
      const column = thread.kind === "channel" ? "channel_id" : "application_id";
      channel = supabase
        .channel(`team:${thread.kind}:${thread.id}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table, filter: `${column}=eq.${thread.id}` }, (payload) => {
          const row = payload.new as Record<string, string | null>;
          const senderId = (row.sender_id ?? row.author_id) as string;
          const msg: ChatMessage = {
            id: row.id as string,
            senderId,
            body: (row.body as string) ?? "",
            createdAt: row.created_at as string,
            hidden: Boolean(row.hidden_at),
            candidate: null,
          };
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          if (!(senderId in knownPeople) || row.application_id) router.refresh();
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table, filter: `${column}=eq.${thread.id}` }, (payload) => {
          const row = payload.new as Record<string, string | null>;
          if (row.hidden_at) setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, hidden: true, body: "", candidate: null } : m)));
        })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
    // knownPeople is read at event time only; resubscribing on every render would drop events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.kind, thread.id, router]);

  return [messages, setMessages] as const;
}
