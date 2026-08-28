"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { submitIntroductionVideo, deleteIntroductionVideo } from "@/lib/actions/introductionVideo";
import type { TalentIntroductionVideoRow } from "@/lib/database.types";

const MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100MB
const MAX_DURATION_SECONDS = 180; // 3 minutes — a bio, not a demo reel
const ALLOWED_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

/**
 * Uses raw XHR against Supabase Storage's REST endpoint, not the
 * supabase-js storage client — the browser Fetch API (which supabase-js
 * uses) has no upload-progress event; XHR's `upload.onprogress` is the
 * only way to show a real percentage, which matters on the low-data
 * connections this app is built around.
 */
function uploadWithProgress(
  path: string,
  file: File,
  accessToken: string,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/talent-videos/${encodeURIComponent(path)}`;
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status}). ${xhr.responseText}`));
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection and try again."));
    xhr.send(file);
  });
}

/** Seeks into the video and captures one frame as a JPEG thumbnail, entirely client-side — no server-side video processing needed. */
function captureThumbnail(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.src = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, video.duration / 2);
    };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(video.src);
        resolve(null);
        return;
      }
      ctx.drawImage(video, 0, 0);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(video.src);
          resolve(blob);
        },
        "image/jpeg",
        0.8
      );
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      resolve(null);
    };
  });
}

function readDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      const duration = video.duration;
      URL.revokeObjectURL(video.src);
      resolve(duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error("Could not read this video file."));
    };
  });
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Submitted — awaiting staff review",
  approved: "Approved — visible on your public Passport",
  rejected: "Not approved",
};

export function IntroductionVideoManager({ existing }: { existing: TalentIntroductionVideoRow | null }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState(existing?.transcript ?? "");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const picked = e.target.files?.[0] ?? null;
    if (!picked) {
      setFile(null);
      return;
    }
    if (!ALLOWED_TYPES.includes(picked.type)) {
      setError("Please upload an MP4, WebM, or MOV video.");
      return;
    }
    if (picked.size > MAX_SIZE_BYTES) {
      setError("Video is too large — 100MB maximum.");
      return;
    }
    try {
      const duration = await readDuration(picked);
      if (duration > MAX_DURATION_SECONDS) {
        setError(`Keep it under ${MAX_DURATION_SECONDS / 60} minutes — this is a quick introduction, not a demo reel.`);
        return;
      }
    } catch {
      setError("Could not read this video file — try a different one.");
      return;
    }
    setFile(picked);
  }

  async function handleUpload() {
    if (!file) return;
    setError(null);
    setBusy(true);
    setProgress(0);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError("Your session has expired — please sign in again.");
        setBusy(false);
        return;
      }

      const stamp = Date.now();
      const videoPath = `${session.user.id}/${stamp}.${file.name.split(".").pop() || "mp4"}`;
      await uploadWithProgress(videoPath, file, session.access_token, setProgress);

      let thumbnailPath: string | null = null;
      const thumbnailBlob = await captureThumbnail(file);
      if (thumbnailBlob) {
        thumbnailPath = `${session.user.id}/${stamp}-thumb.jpg`;
        const { error: thumbError } = await supabase.storage
          .from("talent-videos")
          .upload(thumbnailPath, thumbnailBlob, { contentType: "image/jpeg" });
        if (thumbError) thumbnailPath = null; // non-fatal — the video itself is what matters
      }

      const duration = await readDuration(file).catch(() => null);

      const result = await submitIntroductionVideo({
        videoPath,
        thumbnailPath,
        transcript: transcript.trim() || null,
        durationSeconds: duration,
      });
      if (result.error) {
        setError(result.error);
        setBusy(false);
        return;
      }

      setFile(null);
      setProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setError(null);
    const result = await deleteIntroductionVideo();
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {existing && (
        <div className="rounded-lg border border-slate/15 bg-white p-3">
          <p className="text-sm font-semibold text-midnight">{STATUS_LABEL[existing.status]}</p>
          {existing.status === "rejected" && existing.rejection_reason && (
            <p className="mt-1 text-xs text-coral">{existing.rejection_reason}</p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={handleDelete}
            className="mt-2 text-xs font-semibold text-coral underline disabled:opacity-60"
          >
            Remove video
          </button>
        </div>
      )}

      <div className="rounded-lg border border-slate/15 bg-cloud/40 p-3">
        <label className="text-xs font-semibold text-midnight">
          {existing ? "Replace your video" : "Record or upload a short introduction"}{" "}
          <span className="font-normal text-slate">(optional, under 3 minutes)</span>
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          onChange={handleFileChange}
          className="mt-1 w-full text-sm"
        />
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={3}
          placeholder="Transcript of what you say (recommended — helps accessibility, and staff review it alongside your video)"
          className="mt-2 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        {progress !== null && (
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate/15">
            <div className="h-full bg-teal transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
        {error && (
          <div className="mt-2">
            <p className="text-xs text-coral">{error}</p>
            {file && (
              <button type="button" onClick={handleUpload} className="mt-1 text-xs font-semibold text-teal-ink underline">
                Try again
              </button>
            )}
          </div>
        )}
        <button
          type="button"
          disabled={!file || busy}
          onClick={handleUpload}
          className="mt-2 w-full rounded-lg bg-teal px-4 py-2 text-sm font-bold text-midnight disabled:opacity-60"
        >
          {busy ? (progress !== null ? `Uploading… ${progress}%` : "Saving…") : "Submit for review"}
        </button>
        <p className="mt-1 text-xs text-slate">
          Never a verification requirement or ranking factor — staff review it before it appears on your public Passport.
        </p>
      </div>
    </div>
  );
}
