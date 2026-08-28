import Link from "next/link";

interface RecommendedOpportunity {
  id: string;
  title: string;
  compensationLabel: string;
  orgName: string;
}

interface AttentionItem {
  href: string;
  label: string;
  count: number;
  tone: "warning" | "danger" | "info";
}

const TONE_CLASS: Record<AttentionItem["tone"], string> = {
  warning: "border-coral/30 bg-coral/5",
  danger: "border-coral/40 bg-coral/10",
  info: "border-violet/25 bg-violet/5",
};

/**
 * Stage 8: the talent dashboard's "Today" surface. Every number here
 * comes from a real query the caller ran (dashboard/page.tsx) — nothing
 * is invented client-side. Items with count === 0 are simply omitted by
 * the caller before this renders, so an empty `items` array here is a
 * genuine "nothing needs you right now" state, not a hidden zero.
 */
export function TalentAttentionList({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <p className="mt-3 text-sm text-slate">Nothing needs your attention right now — nice work staying on top of it.</p>
    );
  }
  return (
    <ul className="mt-3 space-y-2">
      {items.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            className={`flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm font-semibold text-midnight ${TONE_CLASS[item.tone]}`}
          >
            <span>{item.label}</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs">{item.count}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function RecommendedOpportunities({ opportunities }: { opportunities: RecommendedOpportunity[] }) {
  if (opportunities.length === 0) {
    return (
      <p className="mt-3 text-sm text-slate">
        No open opportunities match your Passport skills yet —{" "}
        <Link href="/opportunities" className="font-semibold text-teal-ink underline">
          browse everything open
        </Link>
        .
      </p>
    );
  }
  return (
    <ul className="mt-3 space-y-2">
      {opportunities.map((o) => (
        <li key={o.id}>
          <Link href={`/opportunities/${o.id}/apply`} className="flex items-center justify-between rounded-lg border border-slate/15 bg-white px-4 py-2.5 text-sm">
            <span>
              <span className="font-semibold text-midnight">{o.title}</span>
              <span className="block text-xs text-slate">{o.orgName}</span>
            </span>
            <span className="whitespace-nowrap text-xs font-semibold text-teal-ink">{o.compensationLabel}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
