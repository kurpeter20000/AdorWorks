"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Stage 6: talent introduction video (0055). Upsert on talent_id (the
 * table's primary key — one video per talent, not a gallery): replacing
 * an existing video resets it to 'pending' regardless of its previous
 * status, since RLS's update/insert policies both require status =
 * 'pending' on the new row. Old storage objects are cleaned up
 * best-effort after the row write succeeds — a failed cleanup leaves an
 * orphaned file, not a broken video, so it doesn't block the user.
 */
export async function submitIntroductionVideo(input: {
  videoPath: string;
  thumbnailPath: string | null;
  transcript: string | null;
  durationSeconds: number | null;
}): Promise<{ error?: string }> {
  const session = await requireRole("talent");
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("talent_introduction_videos")
    .select("video_path, thumbnail_path")
    .eq("talent_id", session.userId)
    .maybeSingle();

  const { error } = await supabase.from("talent_introduction_videos").upsert(
    {
      talent_id: session.userId,
      video_path: input.videoPath,
      thumbnail_path: input.thumbnailPath,
      transcript: input.transcript,
      duration_seconds: input.durationSeconds,
      status: "pending",
      rejection_reason: null,
      reviewed_by: null,
      reviewed_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "talent_id" }
  );
  if (error) return { error: error.message };

  if (existing) {
    const staleObjects = [existing.video_path, existing.thumbnail_path].filter(
      (p): p is string => !!p && p !== input.videoPath && p !== input.thumbnailPath
    );
    if (staleObjects.length > 0) {
      await supabase.storage.from("talent-videos").remove(staleObjects);
    }
  }

  revalidatePath("/passport");
  revalidatePath(`/passport/${session.userId}`);
  return {};
}

export async function deleteIntroductionVideo(): Promise<{ error?: string }> {
  const session = await requireRole("talent");
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("talent_introduction_videos")
    .select("video_path, thumbnail_path")
    .eq("talent_id", session.userId)
    .maybeSingle();
  if (!existing) return {};

  const { error } = await supabase.from("talent_introduction_videos").delete().eq("talent_id", session.userId);
  if (error) return { error: error.message };

  const objects = [existing.video_path, existing.thumbnail_path].filter((p): p is string => !!p);
  if (objects.length > 0) {
    await supabase.storage.from("talent-videos").remove(objects);
  }

  revalidatePath("/passport");
  revalidatePath(`/passport/${session.userId}`);
  return {};
}
