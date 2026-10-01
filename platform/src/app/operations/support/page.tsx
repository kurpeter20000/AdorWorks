import type { Metadata } from "next";
import { requireRole, STAFF_ROLES } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { SupportConsole } from "./support-console";

export const metadata: Metadata = { title: "Support — Operations" };

/**
 * Staff side of Stage 16 step 3's "support conversations": every
 * conversation with support_user_id set, newest activity first, with a
 * reply box per thread. Disputes attach their opening description here
 * too (see attachDisputeToSupport), so this doubles as the dispute
 * follow-up inbox until a dedicated one exists.
 */
export default async function OperationsSupportPage() {
  await requireRole(...STAFF_ROLES);
  const supabase = await createClient();

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, support_user_id, created_at")
    .not("support_user_id", "is", null)
    .order("created_at", { ascending: false });

  const userIds = [...new Set((conversations ?? []).map((c) => c.support_user_id).filter((id): id is string => id !== null))];
  const { data: profiles } = userIds.length > 0 ? await supabase.from("profiles").select("id, full_name, role").in("id", userIds) : { data: [] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const conversationIds = (conversations ?? []).map((c) => c.id);
  const { data: messages } =
    conversationIds.length > 0
      ? await supabase
          .from("messages")
          .select("id, conversation_id, sender_id, body, created_at")
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: true })
      : { data: [] };

  const threads = (conversations ?? []).map((c) => {
    const profile = c.support_user_id ? profileById.get(c.support_user_id) : undefined;
    return {
      conversationId: c.id,
      userId: c.support_user_id as string,
      userName: profile?.full_name ?? "AdorWorks user",
      userRole: profile?.role ?? null,
      messages: (messages ?? []).filter((m) => m.conversation_id === c.id),
    };
  });

  return (
    <main className="mx-auto max-w-5xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">Support</h1>
      <p className="mt-1 text-sm text-slate">Users messaging AdorWorks directly, and disputes that opened a support thread.</p>

      <SupportConsole threads={threads} />
    </main>
  );
}
