/**
 * A small daily-count bar chart, built from plain divs rather than a
 * charting library — this codebase has none installed, and a handful
 * of bars over 14 days doesn't need one. Server-renderable (no client
 * interactivity), so it works as-is inside a server component like
 * operations/page.tsx.
 */
export function TrendBars({
  title,
  days,
}: {
  title: string;
  days: { label: string; count: number }[];
}) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="rounded-xl border border-slate/15 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-midnight">{title}</p>
        <p className="text-xs text-slate">{total} in the last {days.length} days</p>
      </div>
      <div className="mt-3 flex h-20 items-end gap-1">
        {days.map((d, i) => (
          <div key={i} className="group relative h-full flex-1">
            <div
              className="absolute bottom-0 w-full rounded-t bg-teal/70 transition-colors group-hover:bg-teal"
              style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }}
              title={`${d.label}: ${d.count}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate/60">
        <span>{days[0]?.label}</span>
        <span>{days[days.length - 1]?.label}</span>
      </div>
    </div>
  );
}
