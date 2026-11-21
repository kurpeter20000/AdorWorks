"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, ClipboardList, Home, IdCard, Menu, Search, Sparkles, Wallet, type LucideIcon } from "lucide-react";
import type { SwitchableMode } from "./mode-switcher";
import { msg } from "@/i18n/config";
import { useT } from "@/i18n/client";

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Extra paths that count as "inside" this tab for highlighting. */
  also?: string[];
}

// Canvas Foundations rule 4: "Phone: same order, bottom tab bar with 5 items".
// Four destinations + More (which opens the full grouped menu), so every
// page stays one or two taps away.
const TABS: Record<SwitchableMode, Tab[]> = {
  talent: [
    { href: "/dashboard", label: msg("Home"), icon: Home },
    { href: "/opportunities", label: msg("Find work"), icon: Search },
    { href: "/applications", label: msg("My work"), icon: ClipboardList, also: ["/offers", "/contracts", "/passport/services/requests"] },
    { href: "/passport", label: msg("Passport"), icon: IdCard },
  ],
  employer: [
    { href: "/dashboard", label: msg("Home"), icon: Home },
    { href: "/organisation", label: msg("Hire"), icon: Briefcase },
    { href: "/services", label: msg("Services"), icon: Sparkles, also: ["/organisation/service-requests"] },
    { href: "/contracts", label: msg("Work and pay"), icon: Wallet, also: ["/finance"] },
  ],
};

export function BottomTabBar({ mode, onMore }: { mode: SwitchableMode; onMore: () => void }) {
  const pathname = usePathname();
  const t = useT();
  const tabs = TABS[mode];

  // Longest match wins, so /passport/services/requests lights "My work", not "Passport".
  const candidates = tabs.flatMap((tab) => [tab.href, ...(tab.also ?? [])].map((path) => ({ tab: tab.href, path })));
  const active = candidates
    .filter(({ path }) => pathname === path || (path !== "/dashboard" && pathname.startsWith(`${path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0]?.tab;

  const itemClass = (on: boolean) =>
    `flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-control text-[11px] leading-tight ${
      on ? "font-extrabold text-teal-ink" : "font-bold text-slate"
    }`;

  return (
    <nav
      aria-label={t("Main")}
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-white px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      {tabs.map((tab) => {
        const on = tab.href === active;
        return (
          <Link key={tab.href} href={tab.href} aria-current={on ? "page" : undefined} className={itemClass(on)}>
            <tab.icon className="size-[22px]" strokeWidth={on ? 2.4 : 2} aria-hidden="true" />
            <span className="max-w-full truncate px-0.5">{t(tab.label)}</span>
          </Link>
        );
      })}
      <button type="button" onClick={onMore} className={itemClass(false)} aria-haspopup="dialog">
        <Menu className="size-[22px]" strokeWidth={2} aria-hidden="true" />
        <span>{t("More")}</span>
      </button>
    </nav>
  );
}
