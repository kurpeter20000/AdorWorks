import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ApplicationStage } from "@/lib/database.types";
import { formatDate } from "@/lib/domain/format";
import { getT } from "@/i18n/server";
import { msg } from "@/i18n/config";
import { StatusPill, Stepper, type StatusTone } from "@/components/ui/status";

export interface TalentApplication {
  id: string;
  title: string;
  orgName: string;
  stage: ApplicationStage;
  createdAt: string;
}

// Plain-word steps over the stages the app really records. "Viewed" from
// the canvas is left out until views are tracked (Phase B).
const STEPS = [msg("Applied"), msg("Shortlisted"), msg("Interview"), msg("Offer")];

const STAGE: Record<ApplicationStage, { step: number; pill: string; tone: StatusTone }> = {
  submitted: { step: 0, pill: msg("In review"), tone: "info" },
  shortlisted: { step: 1, pill: msg("Shortlisted"), tone: "waiting" },
  interviewing: { step: 2, pill: msg("Interview"), tone: "waiting" },
  offered: { step: 3, pill: msg("Offer · respond"), tone: "urgent" },
  accepted: { step: 3, pill: msg("Hired"), tone: "done" },
  rejected: { step: 0, pill: msg("Not selected"), tone: "neutral" },
  withdrawn: { step: 0, pill: msg("Withdrawn"), tone: "neutral" },
};

export async function ApplicationsList({ applications }: { applications: TalentApplication[] }) {
  const t = await getT();
  if (applications.length === 0) {
    return (
      <p className="rounded-card border border-line bg-white p-5 text-sm text-slate shadow-card">
        {t("You haven't applied to anything yet.")}{" "}
        <Link href="/opportunities" className="font-bold text-teal-ink hover:underline">
          {t("Find work")}
        </Link>
      </p>
    );
  }
  const steps = STEPS.map((s) => t(s));
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-white shadow-card">
      {applications.map((a) => {
        const stage = STAGE[a.stage];
        const closed = a.stage === "rejected" || a.stage === "withdrawn";
        return (
          <li key={a.id}>
            <Link href="/applications" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-4 transition-colors hover:bg-cloud sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] sm:px-5">
              <span className="min-w-0">
                <span className="block truncate text-sm font-extrabold text-midnight">{a.title}</span>
                <span className="mt-0.5 block truncate text-xs text-slate">
                  {a.orgName} · {t("applied {date}", { date: formatDate(a.createdAt, { day: "numeric", month: "short" }) })}
                </span>
              </span>
              <StatusPill tone={stage.tone} className="sm:order-3">
                {t(stage.pill)}
              </StatusPill>
              {!closed ? (
                <span className="col-span-2 flex min-w-0 items-center gap-3 sm:order-2 sm:col-span-1">
                  <Stepper
                    className="w-full max-w-48"
                    steps={steps}
                    current={stage.step}
                    label={t("Step {n} of {total}: {step}", { n: stage.step + 1, total: steps.length, step: steps[stage.step] })}
                  />
                  <span className="text-xs font-semibold whitespace-nowrap text-slate sm:hidden">{steps[stage.step]}</span>
                </span>
              ) : (
                <span className="hidden sm:order-2 sm:block" />
              )}
              <ChevronRight className="hidden size-4 text-slate/60 sm:order-4 sm:block rtl:rotate-180" aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
