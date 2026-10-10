"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Bell, Menu, X } from "lucide-react";
import { logout } from "@/lib/actions/auth";
import type { DashboardAction } from "@/lib/domain/navigation";
import type { UserRole } from "@/lib/database.types";
import { USER_ROLE_LABELS, getRoleBadgeVariant } from "@/lib/domain/roles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "./app-sidebar";
import { ModeSwitcher, type SwitchableMode } from "./mode-switcher";
import { LanguageSwitcher } from "./language-switcher";
import { IdleTimer } from "./idle-timer";
import { AccountMenu } from "./account-menu";
import { useT } from "@/i18n/client";

export function AppShellClient({
  actions,
  mode,
  role,
  displayName,
  unreadCount,
  marketingSiteUrl,
  avatarUrl,
  profileHref,
  children,
}: {
  actions: readonly DashboardAction[];
  mode: SwitchableMode | null;
  role: UserRole;
  displayName: string;
  unreadCount: number;
  marketingSiteUrl: string;
  avatarUrl: string | null;
  profileHref: string | null;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const t = useT();
  const profileLabel = mode === "employer" ? t("View & edit organisation") : t("View & edit profile");

  const accountFooter = (
    <div className="mt-auto space-y-2 border-t border-slate/10 p-3">
      <div className="flex items-center gap-2 px-1">
        <Badge variant={getRoleBadgeVariant(role)}>{t(USER_ROLE_LABELS[role])}</Badge>
        <span className="truncate text-xs text-slate" title={displayName}>
          {displayName}
        </span>
      </div>
      <LanguageSwitcher className="flex px-1 sm:hidden" />
      <form action={logout}>
        <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
          {t("Sign out")}
        </Button>
      </form>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-1">
      <IdleTimer />
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-e border-slate/15 bg-white lg:flex">
        <Link href="/dashboard" className="px-5 py-4 text-lg font-extrabold text-midnight">
          AdorWorks
        </Link>
        <div className="flex-1 overflow-y-auto">
          <AppSidebar actions={actions} />
        </div>
        {accountFooter}
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            role="presentation"
            className="absolute inset-0 bg-midnight/40"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute start-0 top-0 flex h-full w-72 flex-col overflow-y-auto bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-4">
              <span className="text-lg font-extrabold text-midnight">AdorWorks</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label={t("Close menu")}
                className="rounded-lg p-1.5 hover:bg-cloud"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1">
              <AppSidebar actions={actions} onNavigate={() => setDrawerOpen(false)} />
            </div>
            {accountFooter}
          </aside>
        </div>
      )}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate/15 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label={t("Open menu")}
              className="rounded-lg border border-slate/20 p-2 lg:hidden"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
            <Link href="/dashboard" className="text-lg font-extrabold text-midnight lg:hidden">
              AdorWorks
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <LanguageSwitcher className="hidden sm:inline-flex" />
            {mode && <ModeSwitcher mode={mode} marketingSiteUrl={marketingSiteUrl} />}
            <Link
              href="/notifications"
              aria-label={unreadCount > 0 ? t("Notifications, {n} unread", { n: unreadCount }) : t("Notifications")}
              className="relative rounded-full border border-slate/20 p-2 hover:border-slate/35"
            >
              <Bell className="size-4 text-midnight" aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="absolute -end-1 -top-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-coral-ink px-1 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
            {profileHref && (
              <AccountMenu displayName={displayName} avatarUrl={avatarUrl} profileHref={profileHref} profileLabel={profileLabel} />
            )}
          </div>
        </header>

        <div id="main-content" className="flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
