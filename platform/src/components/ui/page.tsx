import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Page layout primitives. Every screen should use these instead of its own
 * `mx-auto max-w-* p-*`, so widths, gutters and header spacing match
 * across the app.
 *
 *   narrow  — forms and single-column reading (≈672px)
 *   default — most pages (≈1024px)
 *   wide    — dashboards, tables, consoles (≈1280px)
 */
const WIDTH = {
  narrow: "max-w-2xl",
  default: "max-w-5xl",
  wide: "max-w-7xl",
} as const;

export function PageContainer({
  width = "default",
  className,
  children,
}: {
  width?: keyof typeof WIDTH;
  className?: string;
  children: ReactNode;
}) {
  return <main className={cn("mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10", WIDTH[width], className)}>{children}</main>;
}

/** Title block at the top of a page: optional eyebrow, the h1, a one-line description, and right-aligned actions. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="text-xs font-bold tracking-wide text-teal-ink uppercase">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-midnight sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-slate sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A titled block of content within a page. `action` sits opposite the title (e.g. a "See all" link). */
export function Section({
  title,
  description,
  action,
  className,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("min-w-0", className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-extrabold text-midnight sm:text-lg">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-slate sm:text-sm">{description}</p>}
        </div>
        {action && <div className="shrink-0 text-sm font-semibold">{action}</div>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
