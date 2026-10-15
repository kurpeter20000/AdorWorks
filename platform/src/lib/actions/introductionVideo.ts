"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { isValidYoutubeUrl } from "@/lib/domain/youtube";

/**
 * Stage 6: talent introduction video (0055), now a YouTube link rather
 * than a Supabase-Storage upload (0105) — no file handling here at all,
 * just validating and storing a URL. Upsert on talent_id (the table's
 * primary key — one video per talent, not a gallery): replacing an
 * existing video resets it to 'pending' regardless of its previous
 * status, since RLS's update/insert policies both require status =
 * 'pending' on the new row.
 */
export async function submitIntroductionVideo(input: {
  youtubeUrl: string;
  transcript: string | null;
}): Promise<{ error?: string }> {
  const session = await requireRole("talent");

  const youtubeUrl = input.youtubeUrl.trim();
  if (!isValidYoutubeUrl(youtubeUrl)) {
    return { error: "That doesn't look like a YouTube video link — paste the full URL from YouTube." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("talent_introduction_videos").upsert(
    {
      talent_id: session.userId,
      youtube_url: youtubeUrl,
      transcript: input.transcript,
      status: "pending",
      rejection_reason: null,
      reviewed_by: null,
      reviewed_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "talent_id" }
  );
  if (error) return { error: error.message };

  revalidatePath("/passport");
  revalidatePath(`/passport/${session.userId}`);
  return {};
}

export async function deleteIntroductionVideo(): Promise<{ error?: string }> {
  const session = await requireRole("talent");
  const supabase = await createClient();

  const { error } = await supabase.from("talent_introduction_videos").delete().eq("talent_id", session.userId);
  if (error) return { error: error.message };

  revalidatePath("/passport");
  revalidatePath(`/passport/${session.userId}`);
  return {};
}
