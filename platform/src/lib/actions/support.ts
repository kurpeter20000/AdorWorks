"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { msg } from "@/i18n/config";
import { requireSession, requireRole, STAFF_ROLES } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureSupportConversation } from "@/lib/dal/support";
import { notifyUser, NOTIFICATION_TYPES } from "@/lib/domain/notifications";
import type { FormState } from "./auth";

const MessageSchema = z.object({ body: z.string().trim().min(1, msg("Write a message before sending.")).max(4000) });

/**
 * A signed-in user messaging AdorWorks support (Stage 16 step 3) — the
 * in-app alternative to the marketing site's contact form, with no
 * contact-detail filtering: this is the user talking to AdorWorks itself,
 * not to another marketplace party, so the pre-payment rule in
 * lib/domain/messageFilter.ts doesn't apply here.
 */
export async function sendSupportMessage(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const validated = MessageSchema.safeParse({ body: formData.get("body") || "" });
  if (!validated.success) return { errors: validated.error.flatten().fieldErrors };

  const admin = createAdminClient();
  const conversationId = await ensureSupportConversation(admin, session.userId);
  if (!conversationId) return { message: msg("Could not open a conversation with support — try again.") };

  const { error } = await admin.from("messages").insert({ conversation_id: conversationId, sender_id: session.userId, body: validated.data.body });
  if (error) return { message: error.message };

  revalidatePath("/support");
  return {};
}

/**
 * Staff replying to a user's support conversation (/operations/support).
 * Uses the admin client directly for the insert, same convention as every
 * other staff write in this codebase (e.g. postSystemMessage) — simpler
 * and more consistent than bootstrapping a conversation_members row for
 * the replying staff member just to satisfy messages_insert's RLS.
 */
export async function replyToSupportMessage(conversationId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireRole(...STAFF_ROLES);
  const validated = MessageSchema.safeParse({ body: formData.get("body") || "" });
  if (!validated.success) return { errors: validated.error.flatten().fieldErrors };

  const admin = createAdminClient();
  const { data: conversation } = await admin.from("conversations").select("support_user_id").eq("id", conversationId).maybeSingle();
  if (!conversation?.support_user_id) return { message: msg("Conversation not found.") };

  const { error } = await admin.from("messages").insert({ conversation_id: conversationId, sender_id: session.userId, body: validated.data.body });
  if (error) return { message: error.message };

  await notifyUser(admin, {
    userId: conversation.support_user_id,
    type: NOTIFICATION_TYPES.SUPPORT_MESSAGE_RECEIVED,
    title: "AdorWorks support replied",
    link: "/support",
  });

  revalidatePath("/operations/support");
  return {};
}
