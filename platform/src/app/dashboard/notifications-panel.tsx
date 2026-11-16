"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/actions/notifications";
import { formatDateTime } from "@/lib/domain/format";
import type { NotificationRow } from "@/lib/database.types";
import { useT } from "@/i18n/client";

export function NotificationsPanel({ notifications, unreadCount }: { notifications: NotificationRow[]; unreadCount: number }) {
  const router = useRouter();
  const t = useT();
  const [pending, startTransition] = useTransition();

  function markRead(id: string) {
    startTransition(async () => {
      await markNotificationRead(id);
      router.refresh();
    });
  }

  function markAllRead() {
    startTransition(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  }

  if (notifications.length === 0) return null;

  return (
    <section className="rounded-card border border-line bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-extrabold text-midnight">
          {t("Notifications")}
          {unreadCount > 0 && <span className="ms-2 text-xs font-semibold text-coral-ink">({t("{n} new", { n: unreadCount })})</span>}
        </h2>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <button type="button" disabled={pending} onClick={markAllRead} className="text-xs font-semibold text-teal-ink underline disabled:opacity-60">
              {t("Mark all read")}
            </button>
          )}
          <Link href="/notifications" className="text-xs font-semibold text-slate underline">
            {t("See all")}
          </Link>
        </div>
      </div>
      <ul className="mt-3 space-y-1">
        {notifications.map((n) => {
          const content = (
            <div className={`flex gap-3 rounded-control p-3 text-sm transition-colors hover:bg-cloud ${n.read_at ? "" : "bg-violet/5"}`}>
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-violet"}`} aria-hidden="true" />
              <div className="min-w-0">
              <p className="font-semibold text-midnight">{n.title}</p>
              {n.body && <p className="mt-0.5 text-xs text-slate">{n.body}</p>}
              <p className="mt-1 text-xs text-slate">{formatDateTime(n.created_at)}</p>
              </div>
            </div>
          );
          return (
            <li key={n.id}>
              {n.link ? (
                <Link href={n.link} onClick={() => !n.read_at && markRead(n.id)} className="block">
                  {content}
                </Link>
              ) : (
                <button type="button" disabled={pending || !!n.read_at} onClick={() => markRead(n.id)} className="block w-full text-start">
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
