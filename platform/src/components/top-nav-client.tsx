"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions/auth";
import type { NavLink } from "@/lib/domain/navigation";
import type { UserRole } from "@/lib/database.types";
import { USER_ROLE_LABELS, getRoleBadgeVariant } from "@/lib/domain/roles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function TopNavClient({
  links,
  unreadCount,
  displayName,
  role,
}: {
  links: readonly NavLink[];
  unreadCount: number;
  displayName: string;
  role: UserRole;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const allLinks: (NavLink & { badge?: number })[] = [
    { href: "/dashboard", label: "Home" },
    ...links,
    { href: "/notifications", label: "Notifications", badge: unreadCount },
  ];

  return (
    <header className="border-b border-slate/15 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/dashboard" className="text-lg font-extrabold text-midnight">
          AdorWorks
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 sm:flex">
          {allLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? "page" : undefined}
              className={`relative rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                isActive(link.href) ? "bg-cloud text-midnight" : "text-slate hover:text-midnight"
              }`}
            >
              {link.label}
              {!!link.badge && (
                <span
                  aria-label={`${link.badge} unread`}
                  className="ml-1.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-coral px-1 text-[10px] font-bold text-white"
                >
                  {link.badge > 9 ? "9+" : link.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 sm:flex">
          <Badge variant={getRoleBadgeVariant(role)}>{USER_ROLE_LABELS[role]}</Badge>
          <span className="max-w-[10rem] truncate text-xs text-slate" title={displayName}>
            {displayName}
          </span>
          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="primary-nav-mobile"
          aria-label={open ? "Close menu" : "Open menu"}
          className="rounded-lg border border-slate/25 p-2 sm:hidden"
        >
          <span aria-hidden="true">{open ? "✕" : "☰"}</span>
        </button>
      </div>

      {open && (
        <nav id="primary-nav-mobile" aria-label="Primary" className="border-t border-slate/15 bg-white sm:hidden">
          <ul className="mx-auto max-w-4xl space-y-1 px-4 py-3">
            {allLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold ${
                    isActive(link.href) ? "bg-cloud text-midnight" : "text-slate"
                  }`}
                >
                  {link.label}
                  {!!link.badge && (
                    <span className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-coral px-1 text-[10px] font-bold text-white">
                      {link.badge > 9 ? "9+" : link.badge}
                    </span>
                  )}
                </Link>
              </li>
            ))}
            <li className="mt-2 flex items-center justify-between border-t border-slate/15 px-3 pt-3">
              <span className="flex min-w-0 items-center gap-2">
                <Badge variant={getRoleBadgeVariant(role)}>{USER_ROLE_LABELS[role]}</Badge>
                <span className="truncate text-xs text-slate">{displayName}</span>
              </span>
              <form action={logout}>
                <Button type="submit" variant="ghost" size="sm">
                  Sign out
                </Button>
              </form>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
