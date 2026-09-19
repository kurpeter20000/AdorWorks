"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";

export async function markNotificationRead(notificationId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", session.userId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  revalidatePath("/notifications");
  return {};
}

export async function markAllNotificationsRead(): Promise<{ error?: string }> {
  const session = await requireSession();
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", session.userId)
    .is("read_at", null);
  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  revalidatePath("/notifications");
  return {};
}

/**
 * S11-07 — the signed-in path to the same flag the unsubscribe link
 * (lib/actions/unsubscribe.ts) flips from an email. profiles_update's
 * RLS policy (0002) already lets a user update their own row, and 0008's
 * guard trigger only restricts role/status, so this is a plain
 * self-update — no admin client needed.
 */
export async function setEmailNotificationsEnabled(enabled: boolean): Promise<{ error?: string }> {
  const session = await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ email_notifications_enabled: enabled }).eq("id", session.userId);
  if (error) return { error: error.message };
  revalidatePath("/notifications");
  return {};
}
