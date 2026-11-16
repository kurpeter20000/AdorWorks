"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { chooseInterviewSlot } from "@/lib/actions/interviews";
import { LocalTime } from "@/components/local-time";
import { useT } from "@/i18n/client";
import { msg } from "@/i18n/config";

export interface PickableSlot {
  id: string;
  starts_at: string;
  duration_minutes: number;
  mode: "video" | "phone" | "in_person";
  details: string | null;
  status: string;
}

const MODE: Record<PickableSlot["mode"], string> = { video: msg("Video call"), phone: msg("Phone call"), in_person: msg("In person") };

/** Spec "talent confirms … in their own timezone": pick one offered time (0113). */
export function InterviewPicker({ slots }: { slots: PickableSlot[] }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const chosen = slots.find((s) => s.status === "chosen");
  const offered = slots.filter((s) => s.status === "offered");

  if (chosen) {
    return (
      <div className="mt-3 rounded-lg bg-teal/10 px-3 py-2 text-sm text-midnight">
        <p className="font-semibold">{t("Your interview")}</p>
        <p>
          <LocalTime iso={chosen.starts_at} /> · {t(MODE[chosen.mode])} · {t("{n} minutes", { n: chosen.duration_minutes })}
        </p>
        {chosen.details && <p className="text-slate">{chosen.details}</p>}
        <p className="mt-1 text-xs text-slate">{t("We'll remind you a day before and an hour before.")}</p>
      </div>
    );
  }
  if (offered.length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-coral/30 px-3 py-2">
      <p className="text-sm font-semibold text-midnight">{t("Pick a time for your interview")}</p>
      <p className="text-xs text-slate">{t("Shown in your timezone. If none of these work, send the employer a message below.")}</p>
      <ul className="mt-2 space-y-2">
        {offered.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-midnight">
              <LocalTime iso={s.starts_at} className="font-semibold" /> · {t(MODE[s.mode])}
              {s.details ? ` · ${s.details}` : ""}
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await chooseInterviewSlot(s.id);
                  if (r.error) setError(r.error);
                  else router.refresh();
                })
              }
              className="min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-60"
            >
              {t("Pick this time")}
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p className="mt-2 text-sm text-coral-ink" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
