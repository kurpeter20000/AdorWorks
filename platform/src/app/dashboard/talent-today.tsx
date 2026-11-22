"use client";

import Link from "next/link";
import { FIT_LABEL, type FitLevel } from "@/lib/domain/fitCheck";
import { ChevronRight } from "lucide-react";
import { useT } from "@/i18n/client";
import { rich } from "@/i18n/rich";
import { ActionList, type ActionItem } from "./action-list";

interface RecommendedOpportunity {
  id: string;
  title: string;
  compensationLabel: string;
  orgName: string;
  /** Skills this opportunity asks for that are on the talent's Passport. */
  matched: number;
  fit?: FitLevel | null;
  /** Skills the opportunity asks for in total. */
  asked: number;
}

/**
 * Stage 8: the talent dashboard's "Today" surface. Every number here
 * comes from a real query the caller ran (dashboard/page.tsx) — nothing
 * is invented client-side.
 */
export function TalentAttentionList({ items }: { items: ActionItem[] }) {
  const t = useT();
  return <ActionList items={items} emptyMessage={t("Nothing needs your attention right now — nice work staying on top of it.")} />;
}

export function RecommendedOpportunities({ opportunities }: { opportunities: RecommendedOpportunity[] }) {
  const t = useT();
  if (opportunities.length === 0) {
    return (
      <p className="rounded-card border border-line bg-white p-5 text-sm text-slate shadow-card">
        {rich(t("No open opportunities match your Passport skills yet — <all>browse everything open</all>."), {
          all: (text) => (
            <Link href="/opportunities" className="font-semibold text-teal-ink underline">
              {text}
            </Link>
          ),
        })}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-white shadow-card">
      {opportunities.map((o) => (
        <li key={o.id}>
          <Link href={`/opportunities/${o.id}/apply`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-cloud sm:px-5">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-pretty break-words text-midnight">{o.title}</span>
              <span className="mt-0.5 block text-xs text-pretty break-words text-slate">{o.orgName}</span>
              {o.asked > 0 && (
                <span className="mt-2 flex flex-wrap items-center gap-1.5">
                  {o.fit && (
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
                        o.fit === "good" ? "bg-teal/12 text-teal-ink" : o.fit === "stretch" ? "bg-amber-tint text-warning-ink" : "bg-slate/10 text-slate"
                      }`}
                    >
                      {t(FIT_LABEL[o.fit])}
                    </span>
                  )}
                  <span className="text-[11px] font-bold text-slate">{t("{matched} of {asked} skills", { matched: o.matched, asked: o.asked })}</span>
                </span>
              )}
            </span>
            <span className="shrink-0 text-sm font-extrabold whitespace-nowrap text-midnight">{o.compensationLabel}</span>
            <ChevronRight className="size-4 shrink-0 text-slate/60 rtl:rotate-180" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
