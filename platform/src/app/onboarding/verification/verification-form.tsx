"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { completeVerificationStep } from "@/lib/actions/onboarding";

const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export function VerificationForm({ hasExisting }: { hasExisting: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<{ kind: "error" | "success"; message: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  async function handleUpload() {
    if (!file) return;
    setStatus(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setStatus({ kind: "error", message: "Please upload a JPG, PNG or PDF file." });
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setStatus({ kind: "error", message: "File is too large — 8MB maximum." });
      return;
    }

    setUploading(true);
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setStatus({ kind: "error", message: "Your session has expired — please sign in again." });
      setUploading(false);
      return;
    }

    const path = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: uploadError } = await supabase.storage.from("talent-evidence").upload(path, file, {
      upsert: false,
    });
    if (uploadError) {
      setStatus({ kind: "error", message: `Upload failed: ${uploadError.message}` });
      setUploading(false);
      return;
    }

    const { error: insertError } = await supabase.from("talent_evidence").insert({
      talent_id: user.id,
      evidence_type: "identity",
      file_path: path,
      status: "pending",
    });
    if (insertError) {
      setStatus({ kind: "error", message: `Could not record the submission: ${insertError.message}` });
      setUploading(false);
      return;
    }

    setUploading(false);
    setStatus({ kind: "success", message: "Uploaded — a reviewer will check this soon." });
  }

  return (
    <div className="mt-6 space-y-4">
      <div>
        <label htmlFor="idFile" className="text-sm font-semibold text-midnight">
          Identity document
        </label>
        <input
          id="idFile"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1 w-full text-sm"
        />
      </div>

      {status && (
        <p className={`text-sm ${status.kind === "error" ? "text-coral-ink" : "text-teal-ink"}`}>{status.message}</p>
      )}

      <button
        type="button"
        onClick={handleUpload}
        disabled={!file || uploading}
        className="w-full rounded-lg border border-teal px-4 py-2.5 text-sm font-bold text-teal-ink disabled:opacity-60"
      >
        {uploading ? "Uploading…" : "Upload document"}
      </button>

      <button
        type="button"
        disabled={(!hasExisting && status?.kind !== "success") || pending}
        onClick={() => startTransition(() => completeVerificationStep())}
        className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-bold text-midnight disabled:opacity-60"
      >
        {pending ? "Continuing…" : "Continue"}
      </button>
    </div>
  );
}
