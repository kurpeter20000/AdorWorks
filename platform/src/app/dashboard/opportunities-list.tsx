import Link from "next/link";
import { getT } from "@/i18n/server";
import { msg } from "@/i18n/config";
import { StatusPill, type StatusTone } from "@/components/ui/status";

export interface EmployerOpportunity {
  id: string;
  title: string;
  status: string;
  type: string;
  counts: { new: number; shortlisted: number; offered: number; contracted: number };
}

const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  draft: { label: msg("Draft"), tone: "neutral" },
  pending_review: { label: msg("In staff review"), tone: "info" },
  changes_required: { label: msg("Changes requested"), tone: "urgent" },
  open: { label: msg("Published"), tone: "done" },
  paused: { label: msg("Paused"), tone: "neutral" },
  filled: { label: msg("Filled"), tone: "done" },
  closed: { label: msg("Closed"), tone: "neutral" },
  expired: { label: msg("Expired"), tone: "neutral" },
};

const TYPE: Record<string, string> = {
  service: msg("Service"),
  project: msg("Project"),
  contract: msg("Contract"),
  full_time: msg("Full-time job"),
  squad: msg("Team project"),
};

// Applicant bar segments: one hue family per step so the bar reads left→right.
const SEGMENTS = [
  { key: "new", label: msg("New"), className: "bg-slate/25" },
  { key: "shortlisted", label: msg("Shortlisted"), className: "bg-teal/45" },
  { key: "offered", label: msg("Offered"), className: "bg-teal/75" },
  { key: "contracted", label: msg("Contracted"), className: "bg-primary" },
] as const;

export async function OpportunitiesList({ opportunities }: { opportunities: EmployerOpportunity[] }) {
  const t = await getT();
  if (opportunities.length === 0) {
    return (
      <p className="rounded-card border border-line bg-white p-5 text-sm text-slate shadow-card">
        {t("You haven't posted an opportunity yet.")}{" "}
        <Link href="/organisation/opportunities/new" className="font-bold text-teal-ink hover:underline">
          {t("Post an opportunity")}
        </Link>
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">
      <ul className="divide-y divide-line">
        {opportunities.map((o) => {
          const status = STATUS[o.status] ?? { label: o.status, tone: "neutral" as StatusTone };
          const total = o.counts.new + o.counts.shortlisted + o.counts.offered + o.counts.contracted;
          return (
            <li key={o.id}>
              <Link href={`/organisation/opportunities/${o.id}`} className="block px-4 py-4 transition-colors hover:bg-cloud sm:px-5">
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-extrabold text-midnight">{o.title}</span>
                    <span className="mt-0.5 block text-xs text-slate">
                      {t(TYPE[o.type] ?? o.type)} · {total === 1 ? t("1 applicant") : t("{n} applicants", { n: total })}
                    </span>
                  </span>
                  <StatusPill tone={status.tone}>{t(status.label)}</StatusPill>
                </span>
                {total > 0 && (
                  <span className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={SEGMENTS.map((s) => `${t(s.label)} ${o.counts[s.key]}`).join(", ")}>
                    {SEGMENTS.filter((s) => o.counts[s.key] > 0).map((s) => (
                      <span key={s.key} className={s.className} style={{ flexGrow: o.counts[s.key] }} />
                    ))}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-3 text-xs text-slate sm:px-5">
        {SEGMENTS.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-full ${s.className}`} aria-hidden="true" />
            {t(s.label)}
          </span>
        ))}
        <Link href="/organisation/opportunities/batch" className="ms-auto font-bold text-teal-ink hover:underline">
          {t("Post several at once")}
        </Link>
      </div>
    </div>
  );
}
