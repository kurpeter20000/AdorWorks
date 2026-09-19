"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { setTalentCv } from "@/lib/actions/passport";

const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES = ["application/pdf"];

/**
 * S05-06 — a real, single-slot CV upload with genuine replace-in-place
 * semantics, mirroring avatar-upload.tsx's pattern. Backed by the
 * private talent-cv bucket (migration 0065) — "View current CV" uses a
 * client-side signed URL (works because RLS already lets the owner
 * read their own objects; no admin client needed for your own file).
 */
export function CvUpload({ existingPath }: { existingPath: string | null }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<{ kind: "error" | "success"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleUpload() {
    if (!file) return;
    setStatus(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setStatus({ kind: "error", message: "Please upload a PDF." });
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
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

    const path = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: uploadError } = await supabase.storage.from("talent-cv").upload(path, file, {
      upsert: false,
    });
    if (uploadError) {
      setStatus({ kind: "error", message: `Upload failed: ${uploadError.message}` });
      setBusy(false);
      return;
    }

    const result = await setTalentCv(path);
    setBusy(false);
    if (result.message) {
      setStatus({ kind: "error", message: result.message });
      return;
    }
    setFile(null);
    setStatus({ kind: "success", message: "CV updated." });
    router.refresh();
  }

  async function handleView() {
    if (!existingPath) return;
    const supabase = createClient();
    const { data, error } = await supabase.storage.from("talent-cv").createSignedUrl(existingPath, 300);
    if (error || !data) {
      setStatus({ kind: "error", message: "Couldn't open your CV — try again." });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-2">
      {existingPath && (
        <button type="button" onClick={handleView} className="block text-xs font-semibold text-teal-ink underline">
          View current CV
        </button>
      )}
      <input
        type="file"
        aria-label="CV or résumé file"
        accept="application/pdf"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="w-full text-sm"
      />
      {status && (
        <p className={`text-sm ${status.kind === "error" ? "text-coral-ink" : "text-teal-ink"}`} role={status.kind === "error" ? "alert" : "status"}>{status.message}</p>
      )}
      <button
        type="button"
        onClick={handleUpload}
        disabled={!file || busy}
        className="rounded-lg border border-violet px-4 py-2 text-sm font-bold text-violet disabled:opacity-60"
      >
        {busy ? "Uploading…" : existingPath ? "Replace CV" : "Upload CV"}
      </button>
    </div>
  );
}
