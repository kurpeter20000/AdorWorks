"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendSupportMessage } from "@/lib/actions/support";
import { useRealtimeMessages } from "@/lib/hooks/useRealtimeMessages";
import { useT } from "@/i18n/client";

export function SupportThread({
  conversationId,
  currentUserId,
  messages,
}: {
  /** Null until this user's first message to support has ever been sent. */
  conversationId: string | null;
  currentUserId: string;
  messages: { id: string; sender_id: string; body: string; created_at: string }[];
}) {
  const router = useRouter();
  const t = useT();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const liveMessages = useRealtimeMessages(conversationId, messages);

  function send() {
    if (!body.trim()) {
      setError(t("Write a message before sending."));
      return;
    }
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("body", body.trim());
      const result = await sendSupportMessage({}, formData);
      if (result.message) {
        setError(result.message);
        return;
      }
      if (!conversationId) router.refresh();
      setBody("");
    });
  }

  return (
    <div className="mt-6 rounded-xl border border-slate/15 bg-white p-4">
      {liveMessages.length === 0 ? (
        <p className="text-sm text-slate">{t("No messages yet.")}</p>
      ) : (
        <ul className="max-h-96 space-y-2 overflow-y-auto">
          {liveMessages.map((m) => {
            const mine = m.sender_id === currentUserId;
            return (
              <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${mine ? "bg-teal/10 text-midnight" : "bg-violet/10 text-midnight"}`}>
                  {!mine && <p className="mb-0.5 text-[11px] font-bold text-violet">{t("AdorWorks Support")}</p>}
                  {m.body}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex gap-2">
        <label htmlFor="support-message" className="sr-only">
          {t("Write a message")}
        </label>
        <input
          id="support-message"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("Write a message…")}
          className="flex-1 rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={pending}
          onClick={send}
          className="rounded-lg bg-teal px-4 py-2 text-sm font-bold text-midnight disabled:opacity-60"
        >
          {pending ? t("Sending…") : t("Send")}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-coral-ink">{error}</p>}
    </div>
  );
}
