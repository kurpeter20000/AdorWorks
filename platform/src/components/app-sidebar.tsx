"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Bookmark,
  Building2,
  Circle,
  ClipboardList,
  Flag,
  Handshake,
  Settings,
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
import { CONTACT_URL } from "@/lib/domain/marketingSite";
import type { DashboardAction } from "@/lib/domain/navigation";
import { msg } from "@/i18n/config";
import { useT } from "@/i18n/client";

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
  "/operations": LayoutDashboard,
  "/operations/intake": Inbox,
  "/operations/talent": IdCard,
  "/operations/organisations": Building2,
  "/operations/opportunities": Search,
  "/operations/services": Sparkles,
  "/operations/reports": Flag,
  "/operations/engagements": Handshake,
  "/operations/contracts": FileSignature,
  "/operations/assisted-onboarding": LifeBuoy,
  "/operations/people": Users,
  "/operations/settings": Settings,
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
  const t = useT();

  const toItem = (a: DashboardAction) => ({ href: a.href, label: a.label, external: Boolean(a.external) });
  const mainItems = [{ href: "/dashboard", label: msg("Dashboard"), external: false }, ...actions.filter((a) => !a.section).map(toItem)];
  const supportItems = [
    ...actions.filter((a) => a.section === "support").map(toItem),
    // S13-12 — always visible regardless of role, unlike the per-role
    // actions above: the platform app previously had no visible support
    // contact anywhere at all.
    { href: CONTACT_URL, label: msg("Help & Support"), external: true },
  ];

  // Longest matching href wins, so /opportunities isn't also highlighted
  // while /opportunities/saved is the page actually open.
  const allHrefs = [...mainItems, ...supportItems].filter((i) => !i.external).map((i) => i.href);
  const activeHref = allHrefs
    .filter((href) => pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`)))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <nav aria-label={t("Primary")} className="flex flex-col gap-0.5 p-3">
      {mainItems.map(renderItem)}
      <p className="mt-4 mb-1 px-3 text-[11px] font-bold tracking-wide text-slate uppercase">{t("Support")}</p>
      {supportItems.map(renderItem)}
    </nav>
  );

  function renderItem(item: { href: string; label: string; external: boolean }) {
    const Icon = ICONS[item.href] ?? Circle;
    const active = !item.external && item.href === activeHref;
    const className = `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
      active ? "bg-teal/10 text-teal-ink" : "text-slate hover:bg-cloud hover:text-midnight"
    }`;
    if (item.external) {
      return (
        <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer" className={className}>
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          {t(item.label)}
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
        {t(item.label)}
      </Link>
    );
  }
}
