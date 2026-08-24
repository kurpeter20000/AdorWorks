"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { setTalentAvatar } from "@/lib/actions/passport";

const MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function AvatarUpload({ existingUrl }: { existingUrl: string | null }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<{ kind: "error" | "success"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleUpload() {
    if (!file) return;
    setStatus(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setStatus({ kind: "error", message: "Please upload a JPG, PNG or WebP image." });
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setStatus({ kind: "error", message: "Image is too large — 4MB maximum." });
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
    const { error: uploadError } = await supabase.storage.from("talent-avatars").upload(path, file, {
      upsert: false,
    });
    if (uploadError) {
      setStatus({ kind: "error", message: `Upload failed: ${uploadError.message}` });
      setBusy(false);
      return;
    }

    const result = await setTalentAvatar(path);
    setBusy(false);
    if (result.message) {
      setStatus({ kind: "error", message: result.message });
      return;
    }
    setFile(null);
    setStatus({ kind: "success", message: "Photo updated." });
    router.refresh();
  }

  return (
    <div className="flex items-start gap-4">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-cloud">
        {existingUrl && <Image src={existingUrl} alt="" fill sizes="64px" className="object-cover" />}
      </div>
      <div className="flex-1 space-y-2">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
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
          className="rounded-lg border border-violet px-4 py-2 text-sm font-bold text-violet disabled:opacity-60"
        >
          {busy ? "Uploading…" : existingUrl ? "Replace photo" : "Upload photo"}
        </button>
      </div>
    </div>
  );
}
