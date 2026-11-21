"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Circle } from "lucide-react";
import { NAV_ICONS as ICONS } from "./nav-icons";
import { CONTACT_URL } from "@/lib/domain/marketingSite";
import type { DashboardAction } from "@/lib/domain/navigation";
import { msg } from "@/i18n/config";
import { useT } from "@/i18n/client";


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
  // Group by job (DashboardAction.group), keeping first-appearance order.
  // Roles whose links carry no group (staff, agents) keep the older flat
  // list with a "Support" section, unchanged.
  const grouped = actions.some((a) => a.group);
  const groups: { title: string | null; items: ReturnType<typeof toItem>[] }[] = [
    { title: null, items: [{ href: "/dashboard", label: msg("Dashboard"), external: false }] },
  ];
  for (const action of actions) {
    const title = grouped ? (action.group ?? null) : action.section === "support" ? msg("Support") : null;
    const existing = groups.find((g) => g.title === title);
    if (existing) existing.items.push(toItem(action));
    else groups.push({ title, items: [toItem(action)] });
  }
  // S13-12 — always visible regardless of role: the platform app
  // previously had no visible support contact anywhere at all.
  const helpTitle = grouped ? msg("Help") : msg("Support");
  const helpGroup = groups.find((g) => g.title === helpTitle) ?? (groups.push({ title: helpTitle, items: [] }), groups[groups.length - 1]);
  helpGroup.items.push({ href: CONTACT_URL, label: msg("Help & Support"), external: true });

  // Longest matching href wins, so /opportunities isn't also highlighted
  // while /opportunities/saved is the page actually open.
  const allHrefs = groups.flatMap((g) => g.items).filter((i) => !i.external).map((i) => i.href);
  const activeHref = allHrefs
    .filter((href) => pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`)))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <nav aria-label={t("Primary")} className="flex flex-col gap-0.5 p-3">
      {groups.map((g, i) => (
        <div key={g.title ?? `top-${i}`} className={g.title ? "mt-4" : undefined} role={g.title ? "group" : undefined} aria-labelledby={g.title ? `nav-group-${i}` : undefined}>
          {g.title && (
            <p id={`nav-group-${i}`} className="mb-1 px-3 text-[11px] font-extrabold tracking-wider text-slate uppercase">
              {t(g.title)}
            </p>
          )}
          <div className="flex flex-col gap-0.5">{g.items.map(renderItem)}</div>
        </div>
      ))}
    </nav>
  );

  function renderItem(item: { href: string; label: string; external: boolean }) {
    const Icon = ICONS[item.href] ?? Circle;
    const active = !item.external && item.href === activeHref;
    const className = `flex min-h-10 items-center gap-3 rounded-control px-3 text-sm font-bold transition-colors ${
      active ? "bg-teal/12 text-teal-ink" : "text-midnight/80 hover:bg-cloud hover:text-midnight"
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
