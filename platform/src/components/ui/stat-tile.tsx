import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TONE = {
  neutral: "bg-cloud text-midnight",
  teal: "bg-teal/12 text-teal-ink",
  violet: "bg-violet/10 text-violet",
  coral: "bg-coral/12 text-coral-ink",
  amber: "bg-amber-tint text-warning-ink",
} as const;

/**
 * A headline number that links to the list it counts (spec: "4 numbers,
 * each a link to its list"). Real counts only; a zero shows 0 with a
 * hint in `note`, never a blank.
 */
export function StatTile({
  label,
  value,
  href,
  note,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  href: string;
  note?: string;
  icon?: LucideIcon;
  tone?: keyof typeof TONE;
}) {
  return (
    <Link
      href={href}
      className="group flex min-w-0 flex-col gap-2 rounded-card border border-line bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-raised"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-xs leading-snug font-bold text-slate">{label}</span>
        {Icon && (
          <span className={cn("flex size-[30px] shrink-0 items-center justify-center rounded-[9px]", TONE[tone])}>
            <Icon className="size-4" aria-hidden="true" />
          </span>
        )}
      </span>
      <span className="text-2xl leading-none font-extrabold break-words text-midnight tabular-nums sm:text-[28px]">{value}</span>
      {note && <span className="text-xs leading-snug text-slate">{note}</span>}
    </Link>
  );
}
