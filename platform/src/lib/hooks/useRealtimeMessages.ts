"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface RealtimeMessageRow {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  file_path?: string | null;
  file_name?: string | null;
}

/**
 * Keeps a conversation's message list live via Supabase Realtime (Stage
 * 16 step 3) — new rows, sent by either side (including this browser's
 * own just-sent message), stream in over `messages`' postgres_changes
 * feed instead of needing a page reload. RLS (0007) is what limits each
 * subscriber to conversations they're actually in; enabling Realtime on
 * the table (0098) doesn't widen that — Supabase re-checks the same
 * policy per connected subscriber.
 *
 * `conversationId` is null until the first message has ever been sent
 * (the conversation row is created on first use) — the hook simply
 * doesn't subscribe until the caller has one; see each thread
 * component's own comment for how it bridges that one-time gap.
 *
 * `initial` only seeds state on mount — it is not re-synced on every
 * render (that would fight the realtime stream's own appends, and
 * copying a prop into state on every effect run is the exact
 * cascading-render antipattern React's own lint rules flag). Callers
 * that need the list to reset for a new conversation — most notably the
 * null → real-id bootstrap right after a conversation's first message —
 * render this component with `key={conversationId}` so React remounts
 * it and reinitialises state naturally, instead of this hook reaching
 * into a ref during render to detect the change itself.
 */
export function useRealtimeMessages<T extends RealtimeMessageRow>(conversationId: string | null, initial: T[]): T[] {
  const [messages, setMessages] = useState<T[]>(initial);

  useEffect(() => {
    if (!conversationId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new as T;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  return messages;
}
