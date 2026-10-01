import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * A signed-in user's own line to AdorWorks staff (Stage 16 step 3, 0098) —
 * one conversation per user, created on first use. Mirrors the existing
 * check-then-insert + 23505-recovery pattern contract/application
 * messaging already use (postSystemMessage in actions/contracts.ts,
 * sendApplicationMessage in actions/messages.ts) so a race between two
 * concurrent first messages can't fork a duplicate conversation.
 */
export async function ensureSupportConversation(admin: Admin, userId: string): Promise<string | null> {
  const { data: existing } = await admin.from("conversations").select("id").eq("support_user_id", userId).maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await admin.from("conversations").insert({ support_user_id: userId }).select("id").single();
  if (error?.code === "23505") {
    const { data: winner } = await admin.from("conversations").select("id").eq("support_user_id", userId).maybeSingle();
    return winner?.id ?? null;
  }
  if (!created) return null;

  await admin.from("conversation_members").insert({ conversation_id: created.id, user_id: userId });
  return created.id;
}

/**
 * Stage 16 step 3: "wire payment disputes to open directly into a support
 * conversation with the engagement ... attached automatically." Posts a
 * short, clearly-labelled context message into the raising user's own
 * support conversation (creating it if needed) linking back to the
 * contract — staff already review that contract's full written terms,
 * milestones and payment history there, so this doesn't duplicate that,
 * it just makes sure the dispute reaches a conversation staff actually
 * monitor instead of only the contract thread.
 */
export async function attachDisputeToSupport(
  admin: Admin,
  userId: string,
  info: { contractId: string; contractTitle: string; description: string }
): Promise<void> {
  try {
    const conversationId = await ensureSupportConversation(admin, userId);
    if (!conversationId) return;
    const shortId = info.contractId.slice(0, 8).toUpperCase();
    await admin.from("messages").insert({
      conversation_id: conversationId,
      sender_id: userId,
      body: `Dispute raised on contract "${info.contractTitle}" (${shortId}): ${info.description}`,
    });
  } catch (err) {
    // Best-effort — a failure here must never block raiseDispute() itself,
    // same fail-open contract as notifyUser()/logAuditEvent().
    console.error(`[support] attachDisputeToSupport(${info.contractId}) failed:`, err);
  }
}
