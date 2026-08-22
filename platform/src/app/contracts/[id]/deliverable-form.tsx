"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { recordDeliverableSubmission } from "@/lib/actions/contracts";

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

export function DeliverableForm({ contractId, milestoneId }: { contractId: string; milestoneId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [pending, startTransition] = useTransition();

  async function handleSubmit() {
    if (!note.trim() && !file) {
      setError("Add a note or attach a file.");
      return;
    }
    if (file && file.size > MAX_SIZE_BYTES) {
      setError("File is too large — 20MB maximum.");
      return;
    }
    setError(null);
    setWorking(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Your session has expired — please sign in again.");
      setWorking(false);
      return;
    }

    let filePath: string | null = null;
    if (file) {
      const path = `${contractId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: uploadError } = await supabase.storage.from("deliverables").upload(path, file, {
        upsert: false,
      });
      if (uploadError) {
        setError(`Upload failed: ${uploadError.message}`);
        setWorking(false);
        return;
      }
      filePath = path;
    }

    const { error: insertError } = await supabase.from("deliverables").insert({
      milestone_id: milestoneId,
      submitted_by: user.id,
      file_path: filePath,
      note: note.trim() || null,
    });
    if (insertError) {
      setError(`Could not record the submission: ${insertError.message}`);
      setWorking(false);
      return;
    }

    setWorking(false);
    startTransition(async () => {
      const result = await recordDeliverableSubmission(milestoneId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg bg-cloud p-3">
      <p className="text-xs font-semibold text-midnight">Submit this milestone</p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="What are you submitting?"
        className="w-full rounded-lg border border-slate/25 px-2 py-1.5 text-sm"
      />
      <input
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="w-full text-xs"
      />
      {error && <p className="text-xs text-coral">{error}</p>}
      <button
        type="button"
        disabled={working || pending}
        onClick={handleSubmit}
        className="w-full rounded-lg bg-teal px-3 py-1.5 text-sm font-bold text-midnight disabled:opacity-60"
      >
        {working || pending ? "Submitting…" : "Submit"}
      </button>
    </div>
  );
}
