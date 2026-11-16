"use client";

import Link from "next/link";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

export interface ActionItem {
  href: string;
  label: string;
  count: number;
  tone: "warning" | "danger" | "info";
}

// One meaning per colour: coral = urgent, amber = waiting on you, violet = FYI.
const DOT: Record<ActionItem["tone"], string> = {
  danger: "bg-coral",
  warning: "bg-warning",
  info: "bg-violet",
};
const COUNT: Record<ActionItem["tone"], string> = {
  danger: "bg-coral/12 text-coral-ink",
  warning: "bg-warning/15 text-warning-ink",
  info: "bg-violet/10 text-violet",
};

/**
 * The dashboard's "what needs you" list (talent attention items and the
 * employer's hiring priorities). Every count is a real query result from
 * dashboard/page.tsx; zero-count items are dropped by the caller, so an
 * empty list is a genuine all-clear.
 */
export function ActionList({ items, emptyMessage }: { items: ActionItem[]; emptyMessage: string }) {
  const t = useT();
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-card border border-slate/10 bg-white p-5 text-sm text-slate shadow-card">
        <CheckCircle2 className="size-5 shrink-0 text-teal" aria-hidden="true" />
        {emptyMessage}
      </div>
    );
  }
  return (
    <ul className="divide-y divide-slate/10 overflow-hidden rounded-card border border-slate/10 bg-white shadow-card">
      {items.map((item) => (
        <li key={`${item.href}:${item.label}`}>
          <Link href={item.href} className="flex items-center gap-3 px-4 py-3.5 text-sm transition-colors hover:bg-cloud sm:px-5">
            <span className={cn("size-2 shrink-0 rounded-full", DOT[item.tone])} aria-hidden="true" />
            <span className="min-w-0 flex-1 font-semibold text-midnight">{t(item.label)}</span>
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums", COUNT[item.tone])}>{item.count}</span>
            <ChevronRight className="size-4 shrink-0 text-slate/60 rtl:rotate-180" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
