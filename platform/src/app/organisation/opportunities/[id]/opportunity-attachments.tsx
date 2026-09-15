"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { addOpportunityAttachment, removeOpportunityAttachment } from "@/lib/actions/organisation";

const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

interface AttachmentRow {
  id: string;
  filename: string;
  size_bytes: number;
  created_at: string;
}

/** S07-11: employer-side upload/manage for opportunity_attachments — see the server actions for the real RLS-backed gate. */
export function OpportunityAttachments({ opportunityId, attachments }: { opportunityId: string; attachments: AttachmentRow[] }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<{ kind: "error" | "success"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleUpload() {
    if (!file) return;
    setStatus(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setStatus({ kind: "error", message: "Please upload a JPG, PNG, WebP, PDF, or Word document." });
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setStatus({ kind: "error", message: "File is too large — 8MB maximum." });
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const path = `${opportunityId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: uploadError } = await supabase.storage.from("opportunity-attachments").upload(path, file, { upsert: false });
    if (uploadError) {
      setStatus({ kind: "error", message: `Upload failed: ${uploadError.message}` });
      setBusy(false);
      return;
    }

    const result = await addOpportunityAttachment(opportunityId, {
      path,
      filename: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    });
    setBusy(false);
    if (result.message) {
      setStatus({ kind: "error", message: result.message });
      return;
    }
    setStatus({ kind: "success", message: "Uploaded." });
    setFile(null);
    router.refresh();
  }

  return (
    <div className="mt-4 rounded-lg border border-slate/15 bg-cloud/40 p-3">
      <p className="text-xs font-semibold text-midnight">Attachments</p>
      <p className="mt-1 text-xs text-slate">
        Job specs, briefs, or other reference documents — visible to talent once this opportunity is published.
      </p>

      {attachments.length > 0 && (
        <ul className="mt-2 space-y-1">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between text-xs">
              <span className="text-midnight">
                {a.filename} <span className="text-slate">({(a.size_bytes / 1024).toFixed(0)} KB)</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  removeOpportunityAttachment(a.id, opportunityId).then(() => router.refresh());
                }}
                className="font-semibold text-coral-ink underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 space-y-2">
        <input
          type="file"
          accept={ALLOWED_TYPES.join(",")}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full text-xs"
        />
        {status && <p className={`text-xs ${status.kind === "error" ? "text-coral-ink" : "text-teal-ink"}`}>{status.message}</p>}
        <button
          type="button"
          onClick={handleUpload}
          disabled={!file || busy}
          className="rounded-lg border border-slate/25 px-3 py-1.5 text-xs font-semibold text-midnight disabled:opacity-60"
        >
          {busy ? "Uploading…" : "Add attachment"}
        </button>
      </div>
    </div>
  );
}
