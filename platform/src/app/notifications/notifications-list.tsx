"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/actions/notifications";
import type { NotificationRow } from "@/lib/database.types";

export function NotificationsList({ notifications }: { notifications: NotificationRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const unreadCount = notifications.filter((n) => !n.read_at).length;

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

  return (
    <div className="mt-6">
      {unreadCount > 0 && (
        <button type="button" disabled={pending} onClick={markAllRead} className="text-xs font-semibold text-teal-ink underline disabled:opacity-60">
          Mark all read
        </button>
      )}
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
    </div>
  );
}
