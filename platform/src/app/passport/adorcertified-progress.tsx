import { Check, Clock } from "lucide-react";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { CertifiedStep } from "@/lib/domain/adorCertified";

/** Steps from verified to AdorCertified, on the talent's own Passport. */
export function AdorCertifiedProgress({ steps, done, total }: { steps: CertifiedStep[]; done: number; total: number }) {
  return (
    <section aria-labelledby="cert-h" className="mt-6 rounded-xl border border-slate/15 bg-white p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="cert-h" className="font-bold text-midnight">
          Your path to AdorCertified
        </h2>
        <span className="text-sm font-semibold text-slate">
          {done} of {total}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate">AdorCertified means you&rsquo;re eligible to work and have proven the skills for it.</p>
      <ProgressBar className="mt-3" value={done} max={total} label={`${done} of ${total} steps to AdorCertified`} />
      <ol className="mt-4 space-y-3">
        {steps.map((s) => (
          <li key={s.key} className="flex gap-3">
            <span
              className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${
                s.state === "done" ? "bg-teal/15 text-teal-ink" : s.state === "later" ? "bg-cloud text-slate" : "border-2 border-dashed border-slate/40"
              }`}
            >
              {s.state === "done" ? <Check className="size-4" aria-hidden="true" /> : s.state === "later" ? <Clock className="size-3.5" aria-hidden="true" /> : null}
            </span>
            <span>
              <span className="block text-sm font-semibold text-midnight">
                {s.label}
                {s.state === "later" && <span className="ms-2 rounded-full bg-cloud px-2 py-0.5 text-xs font-semibold text-slate">Coming later</span>}
              </span>
              {s.state !== "done" && <span className="block text-xs text-slate">{s.hint}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
