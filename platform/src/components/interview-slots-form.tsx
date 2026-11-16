"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { offerInterviewSlots } from "@/lib/actions/interviews";
import { LocalTime } from "@/components/local-time";

export interface ExistingSlot {
  id: string;
  starts_at: string;
  mode: string;
  details: string | null;
  status: string;
}

const MODES: [string, string][] = [
  ["video", "Video call"],
  ["phone", "Phone call"],
  ["in_person", "In person"],
];

type Row = { when: string; mode: string; details: string };
const blank = (): Row => ({ when: "", mode: "video", details: "" });

/**
 * Offer 1–5 interview times (spec: "offer 2–5 slots"). Times are typed in
 * the employer's own timezone; the browser turns them into an exact
 * moment, so the talent sees the same moment in theirs.
 */
export function InterviewSlotsForm({ applicationId, existing }: { applicationId: string; existing: ExistingSlot[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([blank(), blank()]);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const live = existing.filter((s) => s.status === "offered" || s.status === "chosen");
  const chosen = live.find((s) => s.status === "chosen");

  function submit() {
    const filled = rows.filter((r) => r.when);
    if (filled.length === 0) {
      setError("Add at least one date and time.");
      return;
    }
    setError(null);
    start(async () => {
      const r = await offerInterviewSlots(
        applicationId,
        filled.map((x) => ({ starts_at: new Date(x.when).toISOString(), mode: x.mode as "video", details: x.details || undefined }))
      );
      if (r.error) setError(r.error);
      else {
        setOpen(false);
        setRows([blank(), blank()]);
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-3 rounded-lg border border-slate/15 p-3">
      <p className="text-xs font-semibold tracking-wide text-slate uppercase">Interview</p>
      {chosen ? (
        <p className="mt-1 text-sm text-midnight">
          Booked: <LocalTime iso={chosen.starts_at} className="font-semibold" /> · {MODES.find(([v]) => v === chosen.mode)?.[1]}
          {chosen.details ? ` · ${chosen.details}` : ""}
        </p>
      ) : live.length > 0 ? (
        <div className="mt-1 text-sm text-midnight">
          Waiting for them to pick one of:
          <ul className="mt-1 list-disc ps-5">
            {live.map((s) => (
              <li key={s.id}>
                <LocalTime iso={s.starts_at} />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-1 text-sm text-slate">No interview times offered yet.</p>
      )}

      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="mt-2 min-h-11 text-sm font-semibold text-teal-ink underline">
          {live.length > 0 ? "Offer different times" : "Offer interview times"}
        </button>
      ) : (
        <div className="mt-2 space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                type="datetime-local"
                aria-label={`Time ${i + 1}`}
                value={r.when}
                onChange={(e) => setRows((all) => all.map((x, j) => (j === i ? { ...x, when: e.target.value } : x)))}
                className="min-h-11 rounded-lg border border-slate/25 px-2 text-sm"
              />
              <select
                aria-label={`How, for time ${i + 1}`}
                value={r.mode}
                onChange={(e) => setRows((all) => all.map((x, j) => (j === i ? { ...x, mode: e.target.value } : x)))}
                className="min-h-11 rounded-lg border border-slate/25 px-2 text-sm"
              >
                {MODES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Where or how to join, for time ${i + 1}`}
                placeholder="Where, or how to join (optional)"
                value={r.details}
                onChange={(e) => setRows((all) => all.map((x, j) => (j === i ? { ...x, details: e.target.value } : x)))}
                className="min-h-11 rounded-lg border border-slate/25 px-2 text-sm sm:col-span-2"
              />
            </div>
          ))}
          {rows.length < 5 && (
            <button type="button" onClick={() => setRows((all) => [...all, blank()])} className="min-h-11 text-sm font-semibold text-teal-ink underline">
              Add another time
            </button>
          )}
          <p className="text-xs text-slate">Times are in your timezone. Each person sees them in their own.</p>
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={submit} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-60">
              {pending ? "Sending…" : "Send these times"}
            </button>
            <button type="button" disabled={pending} onClick={() => setOpen(false)} className="min-h-11 rounded-lg border border-slate/25 px-4 text-sm font-semibold text-slate">
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="mt-2 text-sm text-coral-ink" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
