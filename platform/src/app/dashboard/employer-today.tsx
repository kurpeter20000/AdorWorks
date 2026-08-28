import Link from "next/link";

interface PipelineItem {
  href: string;
  label: string;
  count: number;
  tone: "warning" | "danger" | "info";
}

const TONE_CLASS: Record<PipelineItem["tone"], string> = {
  warning: "border-coral/30 bg-coral/5",
  danger: "border-coral/40 bg-coral/10",
  info: "border-violet/25 bg-violet/5",
};

/**
 * Stage 8: the employer dashboard's hiring-priorities surface. Every
 * count comes from a real query in dashboard/page.tsx, scoped to the
 * employer's own organisation — nothing invented, nothing cross-org.
 */
export function EmployerPipelineSummary({ items }: { items: PipelineItem[] }) {
  if (items.length === 0) {
    return <p className="mt-3 text-sm text-slate">Nothing waiting on you right now — your pipeline is caught up.</p>;
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
