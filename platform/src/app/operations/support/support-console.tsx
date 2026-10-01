"use client";

import { useState, useTransition } from "react";
import { replyToSupportMessage } from "@/lib/actions/support";
import { useRealtimeMessages } from "@/lib/hooks/useRealtimeMessages";
import { formatDate } from "@/lib/domain/format";

interface ThreadMessage {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

interface Thread {
  conversationId: string;
  userId: string;
  userName: string;
  userRole: string | null;
  messages: ThreadMessage[];
}

export function SupportConsole({ threads }: { threads: Thread[] }) {
  const [openId, setOpenId] = useState<string | null>(threads[0]?.conversationId ?? null);

  if (threads.length === 0) {
    return <p className="mt-8 text-sm text-slate">No support conversations yet.</p>;
  }

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-[260px_1fr]">
      <ul className="space-y-1">
        {threads.map((thread) => {
          const last = thread.messages[thread.messages.length - 1];
          return (
            <li key={thread.conversationId}>
              <button
                type="button"
                onClick={() => setOpenId(thread.conversationId)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                  openId === thread.conversationId ? "border-teal bg-teal/10" : "border-slate/15 bg-white"
                }`}
              >
                <p className="font-semibold text-midnight">{thread.userName}</p>
                <p className="truncate text-xs text-slate">{last ? last.body : "No messages yet."}</p>
              </button>
            </li>
          );
        })}
      </ul>

      <div>
        {threads
          .filter((t) => t.conversationId === openId)
          .map((thread) => (
            <ThreadPanel key={thread.conversationId} thread={thread} />
          ))}
      </div>
    </div>
  );
}

function ThreadPanel({ thread }: { thread: Thread }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const liveMessages = useRealtimeMessages(thread.conversationId, thread.messages);

  function send() {
    if (!body.trim()) {
      setError("Write a message before sending.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("body", body.trim());
      const result = await replyToSupportMessage(thread.conversationId, {}, formData);
      if (result.message) {
        setError(result.message);
        return;
      }
      setBody("");
    });
  }

  return (
    <div className="rounded-xl border border-slate/15 bg-white p-4">
      <p className="text-sm font-semibold text-midnight">
        {thread.userName}
        {thread.userRole ? <span className="ml-2 text-xs font-normal text-slate">{thread.userRole}</span> : null}
      </p>

      <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto">
        {liveMessages.length === 0 && <li className="text-sm text-slate">No messages yet.</li>}
        {liveMessages.map((m) => {
          const fromStaff = m.sender_id !== thread.userId;
          return (
            <li key={m.id} className={`flex ${fromStaff ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${fromStaff ? "bg-teal/10 text-midnight" : "bg-violet/10 text-midnight"}`}>
                {m.body}
                <p className="mt-1 text-[10px] text-slate">{formatDate(m.created_at)}</p>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex gap-2">
        <label htmlFor={`reply-${thread.conversationId}`} className="sr-only">
          Reply
        </label>
        <input
          id={`reply-${thread.conversationId}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Reply…"
          className="flex-1 rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={pending}
          onClick={send}
          className="rounded-lg bg-teal px-4 py-2 text-sm font-bold text-midnight disabled:opacity-60"
        >
          {pending ? "Sending…" : "Reply"}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-coral-ink">{error}</p>}
    </div>
  );
}
