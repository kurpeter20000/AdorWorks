import type { Metadata } from "next";
import { requireSession } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { SupportThread } from "./support-thread";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Message support") };
}

/**
 * A signed-in user's own line to AdorWorks staff (Stage 16 step 3). One
 * conversation per user — created the first time they send a message
 * here, same shape as the existing contract/application threads.
 */
export default async function SupportPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const t = await getT();

  const { data: conversation } = await supabase.from("conversations").select("id").eq("support_user_id", session.userId).maybeSingle();
  const { data: messages } = conversation
    ? await supabase.from("messages").select("id, sender_id, body, created_at").eq("conversation_id", conversation.id).order("created_at", { ascending: true })
    : { data: [] };

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">{t("Message support")}</h1>
      <p className="mt-1 text-sm text-slate">{t("Talk directly with AdorWorks staff about your account, an opportunity, or anything you're unsure about.")}</p>

      <SupportThread key={conversation?.id ?? "pending"} conversationId={conversation?.id ?? null} currentUserId={session.userId} messages={messages ?? []} />
    </main>
  );
}
