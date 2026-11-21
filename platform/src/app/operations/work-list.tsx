import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { StatusPill, DoneMark } from "@/components/ui/status";
import { StatePanel } from "@/components/state-panel";
import { formatWaited, workItemState, type WorkItem } from "@/lib/domain/workQueue";

const SHOWN = 25;

/**
 * The staff work list: everything waiting on this role, late items
 * first, then oldest first. Each row says what it is, how long it has
 * waited and links to the page where it's handled.
 */
export function WorkList({ items, failed, now }: { items: WorkItem[]; failed: string[]; now: number }) {
  const late = items.filter((i) => workItemState(i, now).overdue).length;
  return (
    <section aria-labelledby="work-list-heading" className="mt-6">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="work-list-heading" className="text-lg font-extrabold text-midnight">
          Your work list
        </h2>
        <p className="text-sm text-slate">
          {items.length === 0 ? "Nothing waiting" : `${items.length} waiting${late > 0 ? ` · ${late} late` : ""}`}
        </p>
      </div>

      {failed.length > 0 && (
        <div className="mb-3">
          <StatePanel title="Part of your work list couldn&rsquo;t load" tone="danger" role="alert">
            Could not load: {failed.join(", ")}. Refresh the page to try again.
          </StatePanel>
        </div>
      )}

      {items.length === 0 ? (
        failed.length === 0 && (
          <p className="flex items-center gap-3 rounded-card border border-line bg-white p-5 text-sm text-slate shadow-card">
            <DoneMark />
            You&rsquo;re all caught up. New items appear here as soon as they arrive.
          </p>
        )
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-white shadow-card">
          {items.slice(0, SHOWN).map((item) => {
            const s = workItemState(item, now);
            const closing = s.hoursLeft !== null ? (s.hoursLeft <= 0 ? "closing today" : `closes in ${formatWaited(s.hoursLeft)}`) : null;
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-cloud sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:px-5"
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-slate">{item.kind}</span>
                    <span className="block truncate text-sm font-extrabold text-midnight first-letter:uppercase">{item.title}</span>
                    {item.detail && <span className="block truncate text-xs text-slate first-letter:uppercase">{item.detail}</span>}
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <StatusPill tone={s.overdue ? "urgent" : "waiting"}>{s.overdue ? "Late" : "Waiting"}</StatusPill>
                    <span className="text-xs whitespace-nowrap text-slate">
                      {closing ?? `waiting ${formatWaited(s.waitedHours)}`}
                    </span>
                  </span>
                  <ChevronRight className="hidden size-4 text-slate/60 sm:block rtl:rotate-180" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > SHOWN && (
        <p className="mt-2 text-sm text-slate">
          Showing the {SHOWN} most urgent of {items.length}. The rest are on each queue&rsquo;s own page.
        </p>
      )}
    </section>
  );
}
