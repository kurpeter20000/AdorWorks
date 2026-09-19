"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Bookmark,
  Building2,
  Circle,
  ClipboardList,
  ExternalLink,
  FileCheck2,
  FilePlus2,
  FileSignature,
  IdCard,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  Mail,
  NotebookPen,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { STAFF_CONSOLE_URL, CONTACT_URL } from "@/lib/domain/marketingSite";
import type { DashboardAction } from "@/lib/domain/navigation";

const ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/organisation": Building2,
  "/organisation/opportunities/new": FilePlus2,
  "/organisation/opportunities/brief": NotebookPen,
  "/organisation/team": Users,
  "/services": Sparkles,
  "/contracts": FileSignature,
  "/notifications": Bell,
  "/assistance/request": LifeBuoy,
  "/opportunities": Search,
  "/passport": IdCard,
  "/applications": ClipboardList,
  "/opportunities/invited": Mail,
  "/offers": FileCheck2,
  "/opportunities/saved": Bookmark,
  "/onboarding": ListChecks,
  "/trust-safety": ShieldCheck,
  "/assist": LifeBuoy,
  "/operations": Inbox,
  [STAFF_CONSOLE_URL]: ExternalLink,
  [CONTACT_URL]: LifeBuoy,
};

export function AppSidebar({
  actions,
  onNavigate,
}: {
  actions: readonly DashboardAction[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  const items = [
    { href: "/dashboard", label: "Dashboard", external: false },
    ...actions.map((a) => ({ href: a.href, label: a.label, external: Boolean(a.external) })),
    // S13-12 — always visible regardless of role, unlike the per-role
    // actions above: the platform app previously had no visible support
    // contact anywhere at all.
    { href: CONTACT_URL, label: "Help & Support", external: true },
  ];

  function isActive(href: string) {
    return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
  }

  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5 p-3">
      {items.map((item) => {
        const Icon = ICONS[item.href] ?? Circle;
        const active = !item.external && isActive(item.href);
        const className = `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
          active ? "bg-teal/10 text-teal-ink" : "text-slate hover:bg-cloud hover:text-midnight"
        }`;
        if (item.external) {
          return (
            <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer" className={className}>
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {item.label}
            </a>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={className}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
