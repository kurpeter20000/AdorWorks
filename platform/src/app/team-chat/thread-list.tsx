"use client";

import Link from "next/link";
import type { ThreadSummary } from "@/lib/dal/teamChat";
import { useT } from "@/i18n/client";
import { channelLabel } from "./labels";

function When({ iso }: { iso: string }) {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return (
    <time dateTime={iso} suppressHydrationWarning className="shrink-0 text-[11px] text-slate">
      {today ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString([], { day: "numeric", month: "short" })}
    </time>
  );
}

/** The conversations sidebar, grouped (Your team, Candidates, staff, each cohort). */
export function ThreadList({ threads, active }: { threads: ThreadSummary[]; active: string | null }) {
  const t = useT();
  const groups: { name: string; items: ThreadSummary[] }[] = [];
  for (const th of threads) {
    const g = groups.find((x) => x.name === th.group);
    if (g) g.items.push(th);
    else groups.push({ name: th.group, items: [th] });
  }
  // Within each group, the most recently active first (channels with no messages keep their order).
  for (const g of groups) g.items.sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));

  if (!threads.length) {
    return <p className="p-4 text-sm text-pretty text-slate">{t("No conversations yet.")}</p>;
  }

  return (
    <nav aria-label={t("Conversations")} className="space-y-4 p-2">
      {groups.map((g) => (
        <div key={g.name}>
          <h3 className="px-2 pb-1 text-[11px] font-bold tracking-wide text-slate uppercase">{channelLabel(g.name, t)}</h3>
          <ul className="space-y-0.5">
            {g.items.map((th) => {
              const isActive = th.key === active;
              return (
                <li key={th.key}>
                  <Link
                    href={`/team-chat?t=${th.key}`}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex items-start gap-2 rounded-xl px-2.5 py-2 ${isActive ? "bg-primary/10" : "hover:bg-cloud"}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className={`min-w-0 flex-1 text-sm text-pretty text-midnight ${th.unread ? "font-extrabold" : "font-semibold"}`}>
                          {th.group === "Candidates" ? <span className="no-i18n">{th.title}</span> : channelLabel(th.title, t)}
                        </span>
                        {th.lastAt && <When iso={th.lastAt} />}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className="line-clamp-1 min-w-0 flex-1 text-xs text-slate no-i18n">
                          {th.lastPreview ?? (th.subtitle ? channelLabel(th.subtitle, t) : "")}
                        </span>
                        {th.unread > 0 && (
                          <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white">
                            {th.unread > 99 ? "99+" : th.unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
