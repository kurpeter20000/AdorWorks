import type { Metadata } from "next";
import { MessagesSquare } from "lucide-react";
import { requireSession, STAFF_ROLES } from "@/lib/dal/session";
import { canCreateChannels, loadThread, loadThreads } from "@/lib/dal/teamChat";
import { parseThreadKey } from "@/lib/domain/teamChat";
import { EMPLOYER_ACCOUNT_ROLES } from "@/lib/domain/roles";
import { getT } from "@/i18n/server";
import { ThreadList } from "./thread-list";
import { TeamThread } from "./team-thread";
import { NewChannel } from "./new-channel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Team chat") };
}

/**
 * Team chat (0127): one place for internal conversations — an
 * employer's team and candidate discussions, AdorWorks staff channels,
 * and Pathways cohort chats. Everyone sees only the threads they belong
 * to. On phones the list and the open thread are separate screens.
 */
export default async function TeamChatPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const session = await requireSession();
  const t = await getT();
  const { t: rawKey } = await searchParams;
  const [threads, canCreate] = await Promise.all([loadThreads(session), canCreateChannels(session)]);
  const key = parseThreadKey(rawKey);
  const detail = key ? await loadThread(session, key) : null;
  const activeKey = detail?.key ?? null;

  const intro = (STAFF_ROLES as readonly string[]).includes(session.role)
    ? t("Talk with the AdorWorks team, and with Pathways cohorts you support.")
    : (EMPLOYER_ACCOUNT_ROLES as readonly string[]).includes(session.role)
      ? t("Talk with your team and discuss applicants together. Applicants never see these conversations.")
      : t("Talk with your Pathways cohort and its facilitators.");

  return (
    <main className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
      <div className={activeKey ? "hidden md:block" : ""}>
        <h1 className="text-2xl font-extrabold text-midnight">{t("Team chat")}</h1>
        <p className="mt-1 text-sm text-pretty text-slate">{intro}</p>
      </div>

      <div className="mt-4 grid h-[calc(100dvh-12rem)] min-h-[28rem] overflow-hidden rounded-card border border-line bg-white shadow-card md:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className={`min-h-0 overflow-y-auto border-line bg-white md:border-e ${activeKey ? "hidden md:block" : ""}`}>
          <ThreadList threads={threads} active={activeKey} />
          {canCreate && (
            <div className="px-2 pb-3">
              <NewChannel />
            </div>
          )}
        </aside>

        <div className={`min-h-0 bg-cloud/40 ${activeKey ? "" : "hidden md:block"}`}>
          {detail ? (
            <TeamThread key={detail.key} detail={detail} me={session.userId} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <MessagesSquare className="size-10 text-slate/60" aria-hidden />
              <p className="max-w-sm text-sm text-pretty text-slate">
                {rawKey ? t("This conversation isn't available to you, or no longer exists.") : t("Choose a conversation to start chatting.")}
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
