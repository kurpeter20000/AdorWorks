import { cn } from "@/lib/utils";

/** Accessible progress bar. `label` is read by screen readers (e.g. "4 of 7 complete"). */
export function ProgressBar({ value, max, label, className }: { value: number; max: number; label: string; className?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-slate/10", className)}
    >
      <div className="h-full rounded-full bg-teal transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  );
}
