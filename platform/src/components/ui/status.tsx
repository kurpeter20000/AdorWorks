import type { ReactNode } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One meaning per colour, everywhere (canvas Foundations):
 *   urgent  coral  — due soon, action needed
 *   waiting amber  — waiting on you, not urgent yet
 *   info    violet — for your information: in review
 *   done    teal   — done, verified
 *   neutral grey   — no status to call out
 */
export type StatusTone = "urgent" | "waiting" | "info" | "done" | "neutral";

const PILL: Record<StatusTone, string> = {
  urgent: "bg-coral/12 text-coral-ink",
  waiting: "bg-amber-tint text-warning-ink",
  info: "bg-violet/10 text-violet",
  done: "bg-teal/12 text-teal-ink",
  neutral: "bg-cloud text-midnight/80",
};

export function StatusPill({ tone, children, className }: { tone: StatusTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs leading-none font-extrabold whitespace-nowrap", PILL[tone], className)}>
      {children}
    </span>
  );
}

/**
 * Where an application or contract stands, as named steps. `current` is
 * the index of the step reached (0-based). Steps up to and including it
 * are filled; the current one is ringed. Screen readers get the summary
 * from `label` (e.g. "Step 2 of 4: Shortlisted").
 */
export function Stepper({ steps, current, label, className }: { steps: string[]; current: number; label: string; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <ol aria-label={label} className="flex items-center">
        {steps.map((step, i) => {
          const reached = i <= current;
          return (
            <li key={step} className={cn("flex items-center", i < steps.length - 1 && "flex-1")}>
              <span
                title={step}
                className={cn(
                  "flex size-3 shrink-0 rounded-full",
                  reached ? "bg-primary" : "border-2 border-slate/30 bg-white",
                  i === current && "ring-4 ring-teal/20"
                )}
              />
              {i < steps.length - 1 && <span aria-hidden="true" className={cn("mx-1 h-[3px] flex-1 rounded-full", i < current ? "bg-primary" : "bg-line")} />}
              <span className="sr-only">
                {step}
                {i === current ? " (current)" : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * The single most urgent thing to do, with its deadline (spec: "Next-step
 * card"). The caller decides what is most urgent from real data and omits
 * the card entirely when nothing is due.
 */
export function NextStepCard({
  eyebrow,
  title,
  meta,
  primary,
  secondary,
  tone = "urgent",
}: {
  eyebrow: string;
  title: string;
  meta?: string;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
  tone?: "urgent" | "waiting";
}) {
  const stripe = tone === "urgent" ? "bg-coral-ink" : "bg-warning";
  const eyebrowColor = tone === "urgent" ? "text-coral-ink" : "text-warning-ink";
  return (
    <section
      aria-label={eyebrow}
      className="relative flex flex-col gap-4 overflow-hidden rounded-card border border-line bg-white p-5 ps-6 shadow-raised sm:flex-row sm:items-center sm:justify-between"
    >
      <span aria-hidden="true" className={cn("absolute inset-y-0 start-0 w-[5px]", stripe)} />
      <div className="min-w-0">
        <p className={cn("text-[11px] font-extrabold tracking-wider uppercase", eyebrowColor)}>{eyebrow}</p>
        <h2 className="mt-1 text-lg leading-snug font-extrabold text-midnight sm:text-xl">{title}</h2>
        {meta && <p className="mt-1 text-sm text-slate">{meta}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        {secondary && (
          <Link href={secondary.href} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-control border border-slate/30 bg-white px-4 text-sm font-bold text-midnight hover:bg-cloud sm:flex-none">
            {secondary.label}
          </Link>
        )}
        <Link href={primary.href} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-control bg-primary px-4 text-sm font-extrabold text-white hover:bg-primary-hover sm:flex-none">
          {primary.label}
        </Link>
      </div>
    </section>
  );
}

/** Small "done" check used in lists. */
export function DoneMark() {
  return <Check className="size-4 text-teal-ink" aria-hidden="true" />;
}
