"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitIntroductionVideo, deleteIntroductionVideo } from "@/lib/actions/introductionVideo";
import { isValidYoutubeUrl, youtubeEmbedUrl } from "@/lib/domain/youtube";
import type { TalentIntroductionVideoRow } from "@/lib/database.types";

const STATUS_LABEL: Record<string, string> = {
  pending: "Submitted — awaiting staff review",
  approved: "Approved — visible on your public Passport",
  rejected: "Not approved",
};

export function IntroductionVideoManager({ existing }: { existing: TalentIntroductionVideoRow | null }) {
  const router = useRouter();
  const [youtubeUrl, setYoutubeUrl] = useState(existing?.youtube_url ?? "");
  const [transcript, setTranscript] = useState(existing?.transcript ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const embedUrl = youtubeEmbedUrl(youtubeUrl);

  async function handleSubmit() {
    setError(null);
    const trimmed = youtubeUrl.trim();
    if (!isValidYoutubeUrl(trimmed)) {
      setError("Paste the full link to your video from YouTube (e.g. https://youtu.be/… or https://www.youtube.com/watch?v=…).");
      return;
    }
    setBusy(true);
    const result = await submitIntroductionVideo({ youtubeUrl: trimmed, transcript: transcript.trim() || null });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
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
    setYoutubeUrl("");
    setTranscript("");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {existing && (
        <div className="rounded-lg border border-slate/15 bg-white p-3">
          <p className="text-sm font-semibold text-midnight">{STATUS_LABEL[existing.status]}</p>
          {existing.status === "rejected" && existing.rejection_reason && (
            <p className="mt-1 text-xs text-coral-ink">{existing.rejection_reason}</p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={handleDelete}
            className="mt-2 text-xs font-semibold text-coral-ink underline disabled:opacity-60"
          >
            Remove video
          </button>
        </div>
      )}

      <div className="rounded-lg border border-slate/15 bg-cloud/40 p-3">
        <label htmlFor="intro-video-url" className="text-xs font-semibold text-midnight">
          {existing ? "Replace your video" : "Link a short introduction"}{" "}
          <span className="font-normal text-slate">(optional — upload it to YouTube first, unlisted is fine, then paste the link here)</span>
        </label>
        <input
          id="intro-video-url"
          type="url"
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          placeholder="https://youtu.be/…"
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        {embedUrl && (
          <div className="mt-2 aspect-video w-full overflow-hidden rounded-lg bg-midnight">
            <iframe
              src={embedUrl}
              title="Introduction video preview"
              className="h-full w-full"
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={3}
          placeholder="Transcript of what you say (recommended — helps accessibility, and staff review it alongside your video)"
          className="mt-2 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        {error && <p className="mt-2 text-xs text-coral-ink">{error}</p>}
        <button
          type="button"
          disabled={!youtubeUrl.trim() || busy}
          onClick={handleSubmit}
          className="mt-2 w-full rounded-lg bg-teal px-4 py-2 text-sm font-bold text-midnight disabled:opacity-60"
        >
          {busy ? "Saving…" : "Submit for review"}
        </button>
        <p className="mt-1 text-xs text-slate">
          Never a verification requirement or ranking factor — staff review it before it appears on your public Passport. Upload
          as &ldquo;Unlisted&rdquo; on YouTube if you don&rsquo;t want it discoverable there — the link still works fine here.
        </p>
      </div>
    </div>
  );
}
