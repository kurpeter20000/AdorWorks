"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { setOrganisationEvidence } from "@/lib/actions/organisation";

const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export function EvidenceUpload({ orgId, existingPath }: { orgId: string; existingPath: string | null }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<{ kind: "error" | "success"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleUpload() {
    if (!file) return;
    setStatus(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setStatus({ kind: "error", message: "Please upload a JPG, PNG, WebP or PDF file." });
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setStatus({ kind: "error", message: "File is too large — 8MB maximum." });
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const path = `${orgId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: uploadError } = await supabase.storage.from("org-documents").upload(path, file, {
      upsert: false,
    });
    if (uploadError) {
      setStatus({ kind: "error", message: `Upload failed: ${uploadError.message}` });
      setBusy(false);
      return;
    }

    const result = await setOrganisationEvidence(orgId, path);
    setBusy(false);
    if (result.message) {
      setStatus({ kind: "error", message: result.message });
      return;
    }
    setStatus({ kind: "success", message: "Uploaded — staff will review it soon." });
    router.refresh();
  }

  return (
    <div className="mt-3 space-y-2">
      {existingPath && <p className="text-xs text-slate">A document is already on file — you can replace it below.</p>}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="w-full text-sm"
      />
      {status && (
        <p className={`text-sm ${status.kind === "error" ? "text-coral" : "text-teal-ink"}`}>{status.message}</p>
      )}
      <button
        type="button"
        onClick={handleUpload}
        disabled={!file || busy}
        className="rounded-lg border border-coral px-4 py-2 text-sm font-bold text-coral disabled:opacity-60"
      >
        {busy ? "Uploading…" : "Upload document"}
      </button>
    </div>
  );
}
