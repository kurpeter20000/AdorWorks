"use client";

import { useState } from "react";
import { ApplicationMessageThread } from "@/components/application-message-thread";

export function ApplicationThreadPanel({
  applicationId,
  currentUserId,
  messages,
}: {
  applicationId: string;
  currentUserId: string;
  messages: { id: string; sender_id: string; body: string; created_at: string }[];
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-xs font-semibold text-teal-ink underline">
        Messages{messages.length > 0 ? ` (${messages.length})` : ""}
      </button>
    );
  }

  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen(false)} className="mb-2 text-xs font-semibold text-slate underline">
        Hide messages
      </button>
      <ApplicationMessageThread applicationId={applicationId} currentUserId={currentUserId} messages={messages} />
    </div>
  );
}
