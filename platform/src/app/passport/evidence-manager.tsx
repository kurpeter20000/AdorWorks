"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { TalentEvidenceRow } from "@/lib/database.types";

const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

// References are link/text-only (just the referee's name and how to reach
// them — no document to upload) and capped: three real references is
// plenty to check, and an unbounded list just makes the reviewer's job
// slower. Credentials/assessment evidence (the other evidenceType this
// component handles) keeps the original file-upload, uncapped behaviour.
const MAX_REFERENCES = 3;

const STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting review",
  approved: "Approved",
  rejected: "Not approved",
};

export function EvidenceManager({
  evidenceType,
  notesPlaceholder,
  items,
}: {
  evidenceType: "reference" | "assessment";
  notesPlaceholder: string;
  items: TalentEvidenceRow[];
}) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<{ kind: "error" | "success"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const allowFile = evidenceType !== "reference";
  const atLimit = evidenceType === "reference" && items.length >= MAX_REFERENCES;

  async function handleAdd() {
    setStatus(null);
    if (!notes.trim() && !file) {
      setStatus({ kind: "error", message: allowFile ? "Add a note or upload a document." : "Add the referee's name and contact details." });
      return;
    }
    if (file && !ALLOWED_TYPES.includes(file.type)) {
      setStatus({ kind: "error", message: "Please upload a JPG, PNG, WebP or PDF file." });
      return;
    }
    if (file && file.size > MAX_SIZE_BYTES) {
      setStatus({ kind: "error", message: "File is too large — 8MB maximum." });
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setStatus({ kind: "error", message: "Your session has expired — please sign in again." });
      setBusy(false);
      return;
    }

    let filePath: string | null = null;
    if (file) {
      const path = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: uploadError } = await supabase.storage.from("talent-evidence").upload(path, file, {
        upsert: false,
      });
      if (uploadError) {
        setStatus({ kind: "error", message: `Upload failed: ${uploadError.message}` });
        setBusy(false);
        return;
      }
      filePath = path;
    }

    const { error: insertError } = await supabase.from("talent_evidence").insert({
      talent_id: user.id,
      evidence_type: evidenceType,
      file_path: filePath,
      notes: notes.trim() || null,
      status: "pending",
    });
    if (insertError) {
      setStatus({ kind: "error", message: `Could not submit this: ${insertError.message}` });
      setBusy(false);
      return;
    }

    setNotes("");
    setFile(null);
    setBusy(false);
    setStatus({ kind: "success", message: "Submitted — a reviewer will check this soon." });
    router.refresh();
  }

  return (
    <div className="mt-4">
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate/15 bg-white p-3">
              <div>
                {item.notes && <p className="text-sm text-midnight">{item.notes}</p>}
                {item.file_path && <p className="text-xs text-slate">File attached</p>}
                {item.status === "rejected" && item.rejection_reason && (
                  <p className="mt-1 text-xs text-coral-ink">{item.rejection_reason}</p>
                )}
              </div>
              <span className="whitespace-nowrap rounded-full bg-cloud px-2.5 py-1 text-xs font-semibold text-slate">
                {STATUS_LABEL[item.status] ?? item.status}
              </span>
            </li>
          ))}
        </ul>
      )}

      {atLimit ? (
        <p className="mt-3 text-xs text-slate">
          You&rsquo;ve added {MAX_REFERENCES} of {MAX_REFERENCES} references — remove one to add a different referee.
        </p>
      ) : (
        <div className="mt-3 space-y-2 rounded-lg border border-slate/15 bg-cloud/40 p-3">
          <textarea
            placeholder={notesPlaceholder}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
          />
          {allowFile && (
            <input
              type="file"
              aria-label="Credential document"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm"
            />
          )}
          {status && (
            <p className={`text-sm ${status.kind === "error" ? "text-coral-ink" : "text-teal-ink"}`} role={status.kind === "error" ? "alert" : "status"}>{status.message}</p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={handleAdd}
            className="w-full rounded-lg bg-teal px-4 py-2 text-sm font-bold text-midnight disabled:opacity-60"
          >
            {busy ? "Submitting…" : "Submit"}
          </button>
        </div>
      )}
    </div>
  );
}
