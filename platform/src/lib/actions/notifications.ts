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
