"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Bookmark,
  Building2,
  Circle,
  ClipboardList,
  FileCheck2,
  FilePlus2,
  FileSignature,
  IdCard,
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
};

export function AppSidebar({
  actions,
  onNavigate,
}: {
  actions: readonly DashboardAction[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  const items = [{ href: "/dashboard", label: "Dashboard" }, ...actions.map((a) => ({ href: a.href, label: a.label }))];

  function isActive(href: string) {
    return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
  }

  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5 p-3">
      {items.map((item) => {
        const Icon = ICONS[item.href] ?? Circle;
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              active ? "bg-teal/10 text-teal-ink" : "text-slate hover:bg-cloud hover:text-midnight"
            }`}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
