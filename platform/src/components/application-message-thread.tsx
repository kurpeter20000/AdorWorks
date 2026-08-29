"use client";

import { useState, useTransition } from "react";
import { sendApplicationMessage } from "@/lib/actions/messages";

export function ApplicationMessageThread({
  applicationId,
  currentUserId,
  messages,
}: {
  applicationId: string;
  currentUserId: string;
  messages: { id: string; sender_id: string; body: string; created_at: string }[];
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    if (!body.trim()) {
      setError("Write a message before sending.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("body", body.trim());
      const result = await sendApplicationMessage(applicationId, {}, formData);
      if (result.message) {
        setError(result.message);
        return;
      }
      setBody("");
    });
  }

  return (
    <div className="rounded-lg border border-slate/15 bg-white p-3">
      {messages.length === 0 ? (
        <p className="text-xs text-slate">No messages yet.</p>
      ) : (
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {messages.map((m) => {
            const mine = m.sender_id === currentUserId;
            return (
              <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs ${mine ? "bg-teal/10 text-midnight" : "bg-cloud text-midnight"}`}>
                  {m.body}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-2 flex gap-2">
        <label htmlFor={`app-message-${applicationId}`} className="sr-only">
          Write a message
        </label>
        <input
          id={`app-message-${applicationId}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a message…"
          className="flex-1 rounded-lg border border-slate/25 px-2.5 py-1.5 text-xs"
        />
        <button
          type="button"
          disabled={pending}
          onClick={send}
          className="rounded-lg bg-teal px-3 py-1.5 text-xs font-bold text-midnight disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send"}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-coral-ink">{error}</p>}
    </div>
  );
}
