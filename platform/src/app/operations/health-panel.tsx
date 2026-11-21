import Link from "next/link";
import { Check, TriangleAlert } from "lucide-react";
import type { HealthLine } from "@/lib/dal/platformHealth";

/** Staff overview: this week's numbers and the fair-ranking check. */
export function HealthPanel({ lines, vaguePay, failed }: { lines: HealthLine[]; vaguePay: { id: string; title: string }[]; failed: boolean }) {
  return (
    <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section aria-labelledby="health-h" className="min-w-0 rounded-card border border-line bg-white p-5 shadow-card">
        <h2 id="health-h" className="text-base font-extrabold text-midnight">
          This week
        </h2>
        {failed ? (
          <p className="mt-2 text-sm text-coral-ink">Couldn&rsquo;t load these numbers — refresh to try again.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {lines.map((l) => (
              <li key={l.label} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className="text-slate">{l.label}</span>
                <span className="text-end">
                  <span className="font-extrabold text-midnight">{l.value}</span>
                  {l.change && (
                    <span className={`ms-2 text-xs font-bold ${l.change.direction === "down" ? "text-coral-ink" : l.change.direction === "up" ? "text-teal-ink" : "text-slate"}`}>
                      {l.change.text}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="fair-h" className="min-w-0 rounded-card border border-line bg-white p-5 shadow-card">
        <h2 id="fair-h" className="text-base font-extrabold text-midnight">
          Fair-ranking check
        </h2>
        <p className="mt-2 flex gap-2 text-sm text-midnight">
          <Check className="mt-0.5 size-4 shrink-0 text-teal-ink" aria-hidden="true" />
          Recommendations rank by skill overlap only — never pay or reputation. An automated test checks this on every release.
        </p>
        {vaguePay.length === 0 ? (
          <p className="mt-2 flex gap-2 text-sm text-midnight">
            <Check className="mt-0.5 size-4 shrink-0 text-teal-ink" aria-hidden="true" />
            Every published opportunity states its pay.
          </p>
        ) : (
          <div className="mt-2 text-sm text-midnight">
            <p className="flex gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-coral-ink" aria-hidden="true" />
              {vaguePay.length === 1 ? "1 published opportunity doesn't state clear pay:" : `${vaguePay.length} published opportunities don't state clear pay:`}
            </p>
            <ul className="mt-1 list-disc ps-8 text-xs text-slate">
              {vaguePay.slice(0, 5).map((o) => (
                <li key={o.id}>
                  <Link href={`/operations/opportunities?status=open`} className="underline">
                    {o.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
