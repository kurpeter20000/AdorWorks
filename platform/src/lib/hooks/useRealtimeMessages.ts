"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
 * (the conversation row is created on first use). A subscription needs a
 * conversation_id to filter on, so there's nothing to filter by yet — but
 * the *other* party may already have this page open when that first
 * message arrives, so simply not subscribing would miss it. Instead,
 * while conversationId is null, this subscribes to messages INSERT with
 * no filter at all: Supabase still re-checks RLS per row before
 * delivering it, and by the time a first message exists its conversation
 * already has both participants as members (see postSystemMessage /
 * sendMessage), so a genuine first message for this thread is delivered
 * same as any other — it's just not yet known which conversation_id to
 * expect, so any delivery here is treated as "something changed, go get
 * the real state" rather than appended directly.
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
 *
 * Found live (e2e): a fresh page load restores its session from cookies
 * rather than firing a live sign-in event, and subscribing immediately —
 * before the realtime client has finished wiring that restored session's
 * JWT onto the socket — means Postgres evaluates RLS with no auth.uid()
 * at all, so every row is silently (and permanently, for that channel)
 * rejected. `supabase.auth.getSession()` resolves once hydration is
 * done; explicitly passing its token to `realtime.setAuth()` before
 * subscribing closes that race instead of hoping the client's own
 * internal auth-state wiring won by then.
 */
export function useRealtimeMessages<T extends RealtimeMessageRow>(conversationId: string | null, initial: T[]): T[] {
  const [messages, setMessages] = useState<T[]>(initial);
  const router = useRouter();

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

      if (!conversationId) {
        // Pre-first-message state: any insert this subscriber is allowed
        // to see (RLS-filtered) might be the first message of *this*
        // thread — there's no conversation_id yet to tell for sure, so
        // refresh and let the server re-derive it. router.refresh()
        // re-renders this component with the real conversationId as its
        // key, which remounts it into the normal, filtered-subscription
        // branch below.
        channel = supabase
          .channel(`messages:pending:${Math.random().toString(36).slice(2)}`)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
            router.refresh();
          })
          .subscribe();
        return;
      }

      channel = supabase
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
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [conversationId, router]);

  return messages;
}
