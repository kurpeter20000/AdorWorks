"use client";

import { useActionState } from "react";
import { sendMessage } from "@/lib/actions/contracts";
import type { FormState } from "@/lib/actions/auth";

const initialState: FormState = {};

export function MessageThread({
  contractId,
  currentUserId,
  messages,
}: {
  contractId: string;
  currentUserId: string;
  messages: { id: string; sender_id: string; body: string; created_at: string }[];
}) {
  const boundAction = sendMessage.bind(null, contractId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <div className="mt-3 rounded-xl border border-slate/15 bg-white p-4">
      {messages.length === 0 ? (
        <p className="text-sm text-slate">No messages yet.</p>
      ) : (
        <ul className="max-h-80 space-y-2 overflow-y-auto">
          {messages.map((m) => {
            const mine = m.sender_id === currentUserId;
            return (
              <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                    mine ? "bg-teal/10 text-midnight" : "bg-cloud text-midnight"
                  }`}
                >
                  {m.body}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form action={formAction} className="mt-3 flex gap-2">
        <input
          name="body"
          placeholder="Write a message…"
          required
          className="flex-1 rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-teal px-4 py-2 text-sm font-bold text-midnight disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send"}
        </button>
      </form>
      {state.message && <p className="mt-1 text-xs text-coral">{state.message}</p>}
      {state.errors?.body && <p className="mt-1 text-xs text-coral">{state.errors.body[0]}</p>}
    </div>
  );
}
