"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const STEPS = [
  { href: "/onboarding/basics", label: "Basics" },
  { href: "/onboarding/verification", label: "Verification" },
  { href: "/onboarding/review", label: "Review & publish" },
];

/**
 * S05-01 — was plain text with no completed/current state and no way
 * to jump back except the browser button. Steps before the current one
 * are real links (you've necessarily already reached them, so
 * revisiting is always safe — onboarding/basics/page.tsx has no guard
 * against being re-opened). The current step is highlighted, not a
 * link to itself. Steps after the current one stay plain text — we
 * don't know from the URL alone whether they're actually reachable yet
 * (see onboarding/page.tsx's own resume logic), so this doesn't offer
 * to skip ahead.
 */
export function OnboardingNav() {
  const pathname = usePathname();
  const currentIndex = STEPS.findIndex((step) => pathname === step.href || pathname.startsWith(`${step.href}/`));

  return (
    <nav aria-label="Onboarding steps" className="mb-6 flex flex-wrap items-center gap-2 text-xs font-semibold">
      {STEPS.map((step, i) => {
        const isCurrent = i === currentIndex;
        const isPast = currentIndex !== -1 && i < currentIndex;
        return (
          <span key={step.href} className="flex items-center gap-2">
            {i > 0 && (
              <span aria-hidden="true" className="text-slate/40">
                &rarr;
              </span>
            )}
            {isPast ? (
              <Link href={step.href} className="text-teal-ink underline">
                {step.label}
              </Link>
            ) : (
              <span aria-current={isCurrent ? "step" : undefined} className={isCurrent ? "text-midnight" : "text-slate/50"}>
                {step.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
