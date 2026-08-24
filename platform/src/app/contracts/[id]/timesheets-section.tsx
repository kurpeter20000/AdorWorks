"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { TimesheetRow } from "@/lib/database.types";

const STATUS_LABEL: Record<string, string> = {
  submitted: "Awaiting review",
  approved: "Approved",
  rejected: "Rejected",
};
const STATUS_STYLE: Record<string, string> = {
  submitted: "bg-slate/10 text-slate",
  approved: "bg-teal/10 text-teal",
  rejected: "bg-coral/10 text-coral",
};

export function TimesheetsSection({
  contractId,
  isTalent,
  isEmployer,
  timesheets,
}: {
  contractId: string;
  isTalent: boolean;
  isEmployer: boolean;
  timesheets: TimesheetRow[];
}) {
  const router = useRouter();
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [hours, setHours] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!periodStart || !periodEnd || !hours) {
      setError("Fill in the period and hours.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const { error: insertError } = await supabase.from("timesheets").insert({
        contract_id: contractId,
        period_start: periodStart,
        period_end: periodEnd,
        hours: Number(hours),
      });
      if (insertError) {
        setError(insertError.message);
        return;
      }
      setPeriodStart("");
      setPeriodEnd("");
      setHours("");
      router.refresh();
    });
  }

  function setStatus(id: string, status: "approved" | "rejected") {
    startTransition(async () => {
      const supabase = createClient();
      const { error: updateError } = await supabase.from("timesheets").update({ status }).eq("id", id);
      if (updateError) setError(updateError.message);
      else router.refresh();
    });
  }

  return (
    <div className="mt-8">
      <h2 className="font-bold text-midnight">Timesheets</h2>

      {timesheets.length === 0 ? (
        <p className="mt-2 text-sm text-slate">No timesheets logged yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {timesheets.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between rounded-xl border border-slate/15 bg-white p-3"
            >
              <div>
                <p className="text-sm font-semibold text-midnight">
                  {t.period_start} – {t.period_end}
                </p>
                <p className="text-xs text-slate">{t.hours} hours</p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[t.status] ?? "bg-slate/10 text-slate"}`}
                >
                  {STATUS_LABEL[t.status] ?? t.status}
                </span>
                {isEmployer && t.status === "submitted" && (
                  <>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setStatus(t.id, "approved")}
                      className="text-xs font-semibold text-teal underline disabled:opacity-60"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setStatus(t.id, "rejected")}
                      className="text-xs font-semibold text-coral underline disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {isTalent && (
        <div className="mt-3 rounded-xl border border-slate/15 bg-white p-4">
          <p className="text-xs font-semibold text-midnight">Log hours</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="rounded-lg border border-slate/25 px-2 py-1.5 text-sm"
            />
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="rounded-lg border border-slate/25 px-2 py-1.5 text-sm"
            />
            <input
              type="number"
              min="0"
              step="0.25"
              placeholder="Hours"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="rounded-lg border border-slate/25 px-2 py-1.5 text-sm"
            />
          </div>
          {error && <p className="mt-2 text-xs text-coral">{error}</p>}
          <button
            type="button"
            disabled={pending}
            onClick={submit}
            className="mt-2 w-full rounded-lg bg-teal px-3 py-1.5 text-sm font-bold text-midnight disabled:opacity-60"
          >
            {pending ? "Saving…" : "Submit timesheet"}
          </button>
        </div>
      )}
    </div>
  );
}
