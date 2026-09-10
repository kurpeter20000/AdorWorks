"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Briefcase, ChevronDown, ChevronRight, Compass, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type SwitchableMode = "talent" | "employer";

const MODE_META: Record<SwitchableMode, { label: string; subtitle: string; icon: typeof Briefcase }> = {
  talent: { label: "Talent Mode", subtitle: "Find new jobs on AdorWorks", icon: Search },
  employer: { label: "Client Mode", subtitle: "Hire top talent", icon: Briefcase },
};

// "freelance" and "fixed_term_contract" (see database.types.ts EngagementType)
// read as the same real-world arrangement to a talent choosing a mode, so
// they're offered as one merged category here — opportunities/page.tsx's
// workType param maps this single choice back to both underlying values.
const WORK_TYPES: { value: string; label: string }[] = [
  { value: "full_time", label: "Full-time" },
  { value: "freelance_contract", label: "Freelancing/Contract" },
];

export function ModeSwitcher({ mode, marketingSiteUrl }: { mode: SwitchableMode; marketingSiteUrl: string }) {
  const [open, setOpen] = useState(false);
  const [showWorkTypes, setShowWorkTypes] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const meta = MODE_META[mode];
  const Icon = meta.icon;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-2 rounded-full border border-slate/20 bg-cloud px-3 py-1.5 text-sm font-semibold text-midnight hover:border-slate/35"
      >
        <Icon className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">{meta.label}</span>
        <ChevronDown className="size-3.5 text-slate" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Switch mode"
          className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-slate/15 bg-white p-2 shadow-lg"
        >
          {mode === "talent" ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => setShowWorkTypes((v) => !v)}
              aria-expanded={showWorkTypes}
              className="flex w-full items-center justify-between rounded-lg bg-teal/10 px-3 py-2.5 text-left"
            >
              <span className="flex items-center gap-2">
                <Search className="size-4 text-teal-ink" aria-hidden="true" />
                <span>
                  <span className="block text-sm font-bold text-midnight">Talent Mode</span>
                  <span className="block text-xs text-slate">Find new jobs on AdorWorks</span>
                </span>
              </span>
              <ChevronRight
                className={cn("size-4 shrink-0 text-slate transition-transform", showWorkTypes && "rotate-90")}
                aria-hidden="true"
              />
            </button>
          ) : (
            <Link
              href="/dashboard"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg bg-teal/10 px-3 py-2.5"
            >
              <Briefcase className="size-4 text-teal-ink" aria-hidden="true" />
              <span>
                <span className="block text-sm font-bold text-midnight">Client Mode</span>
                <span className="block text-xs text-slate">Hire top talent</span>
              </span>
            </Link>
          )}

          {mode === "talent" && showWorkTypes && (
            <div className="mt-1 space-y-1 pb-1 pl-3">
              {WORK_TYPES.map((workType) => (
                <Link
                  key={workType.value}
                  href={`/opportunities?workType=${workType.value}`}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="block rounded-lg border border-slate/15 px-3 py-2 text-sm font-semibold text-midnight hover:border-teal/40 hover:bg-teal/5"
                >
                  {workType.label}
                </Link>
              ))}
            </div>
          )}

          <a
            href={marketingSiteUrl}
            role="menuitem"
            className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2.5 hover:bg-cloud"
          >
            <Compass className="size-4 text-slate" aria-hidden="true" />
            <span>
              <span className="block text-sm font-bold text-midnight">Explore Mode</span>
              <span className="block text-xs text-slate">Explore the AdorWorks website</span>
            </span>
          </a>

          <p className="mt-1 border-t border-slate/10 px-3 pt-2 text-[11px] text-slate">
            Switching modes changes your view
          </p>
        </div>
      )}
    </div>
  );
}
