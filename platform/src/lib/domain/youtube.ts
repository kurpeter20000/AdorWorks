// Accepts the same URL shapes the DB check constraint
// (talent_introduction_videos_youtube_url_check, migration 0105) allows —
// watch, youtu.be, embed and shorts links — and pulls out the video id,
// which is all either the embed iframe or a resubmission check needs.
const YOUTUBE_URL_RE =
  /^https:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/;

export function extractYoutubeId(url: string): string | null {
  const match = url.trim().match(YOUTUBE_URL_RE);
  return match ? match[1] : null;
}

export function isValidYoutubeUrl(url: string): boolean {
  return extractYoutubeId(url) !== null;
}

/** youtube-nocookie.com defers setting cookies/tracking until playback actually starts. */
export function youtubeEmbedUrl(url: string): string | null {
  const id = extractYoutubeId(url);
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}
