import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TONE = {
  neutral: "bg-cloud text-midnight",
  teal: "bg-teal/12 text-teal-ink",
  violet: "bg-violet/10 text-violet",
  coral: "bg-coral/12 text-coral-ink",
} as const;

/** A single headline number that links to where it can be acted on. Real counts only. */
export function StatTile({
  label,
  value,
  href,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: number;
  href: string;
  icon?: LucideIcon;
  tone?: keyof typeof TONE;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-card border border-slate/10 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-raised"
    >
      {Icon && (
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-control", TONE[tone])}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-2xl leading-none font-extrabold text-midnight tabular-nums">{value}</span>
        <span className="mt-1 block text-xs leading-snug font-semibold text-slate">{label}</span>
      </span>
    </Link>
  );
}
