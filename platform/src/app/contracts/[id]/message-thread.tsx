"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { sendMessage } from "@/lib/actions/contracts";

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

function AttachmentLink({ filePath, fileName }: { filePath: string; fileName: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .storage.from("message-attachments")
      .createSignedUrl(filePath, 300)
      .then(({ data }) => {
        if (!cancelled && data) setUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  if (!url) return <p className="mt-1 text-xs text-slate">{fileName} (loading link…)</p>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mt-1 block text-xs font-semibold underline">
      📎 {fileName}
    </a>
  );
}

export function MessageThread({
  contractId,
  currentUserId,
  messages,
}: {
  contractId: string;
  currentUserId: string;
  messages: { id: string; sender_id: string; body: string; file_path: string | null; file_name: string | null; created_at: string }[];
}) {
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    if (!body.trim() && !file) {
      setError("Write a message or attach a file.");
      return;
    }
    if (file && file.size > MAX_SIZE_BYTES) {
      setError("File is too large — 20MB maximum.");
      return;
    }
    setError(null);

    startTransition(async () => {
      const supabase = createClient();
      let filePath: string | null = null;
      if (file) {
        const path = `${contractId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: uploadError } = await supabase.storage.from("message-attachments").upload(path, file, {
          upsert: false,
        });
        if (uploadError) {
          setError(`Upload failed: ${uploadError.message}`);
          return;
        }
        filePath = path;
      }

      const formData = new FormData();
      formData.set("body", body.trim());
      if (filePath && file) {
        formData.set("filePath", filePath);
        formData.set("fileName", file.name);
      }
      const result = await sendMessage(contractId, {}, formData);
      if (result.message) {
        setError(result.message);
        return;
      }
      setBody("");
      setFile(null);
    });
  }

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
                  {m.file_path && m.file_name && (
                    <AttachmentLink filePath={m.file_path} fileName={m.file_name} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-col gap-2">
        <div className="flex gap-2">
          <label htmlFor="message-body" className="sr-only">
            Write a message
          </label>
          <input
            id="message-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a message…"
            className="flex-1 rounded-lg border border-slate/25 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={pending}
            onClick={send}
            className="rounded-lg bg-teal px-4 py-2 text-sm font-bold text-midnight disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="message-attachment" className="sr-only">
            Attach a file
          </label>
          <input
            id="message-attachment"
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="flex-1 text-xs"
          />
          {file && <span className="text-xs text-slate">{file.name}</span>}
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-coral">{error}</p>}
    </div>
  );
}
