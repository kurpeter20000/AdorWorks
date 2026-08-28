"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/actions/notifications";
import type { NotificationRow } from "@/lib/database.types";

export function NotificationsPanel({ notifications, unreadCount }: { notifications: NotificationRow[]; unreadCount: number }) {
  const router = useRouter();
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
    <section className="mt-6 rounded-xl border border-slate/15 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-midnight">
          Notifications{unreadCount > 0 && <span className="ml-2 text-xs font-semibold text-coral">({unreadCount} new)</span>}
        </h2>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <button type="button" disabled={pending} onClick={markAllRead} className="text-xs font-semibold text-teal-ink underline disabled:opacity-60">
              Mark all read
            </button>
          )}
          <Link href="/notifications" className="text-xs font-semibold text-slate underline">
            See all
          </Link>
        </div>
      </div>
      <ul className="mt-3 space-y-2">
        {notifications.map((n) => {
          const content = (
            <div className={`rounded-lg border p-3 text-sm ${n.read_at ? "border-slate/10 bg-white" : "border-violet/20 bg-violet/5"}`}>
              <p className="font-semibold text-midnight">{n.title}</p>
              {n.body && <p className="mt-0.5 text-xs text-slate">{n.body}</p>}
              <p className="mt-1 text-xs text-slate">{new Date(n.created_at).toLocaleString()}</p>
            </div>
          );
          return (
            <li key={n.id}>
              {n.link ? (
                <Link href={n.link} onClick={() => !n.read_at && markRead(n.id)} className="block">
                  {content}
                </Link>
              ) : (
                <button type="button" disabled={pending || !!n.read_at} onClick={() => markRead(n.id)} className="block w-full text-left">
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
