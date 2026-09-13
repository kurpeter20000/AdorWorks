"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { TalentWorkExperienceRow } from "@/lib/database.types";

/**
 * S05-05 — work experience. Same add/delete/reorder structure as
 * portfolio-manager.tsx (no file upload here, just date-range fields).
 * "Currently working here" is the checkbox clearing endDate to null,
 * not a separate stored flag — see migration 0066's comment for why.
 */
export function WorkExperienceManager({ items }: { items: TalentWorkExperienceRow[] }) {
  const router = useRouter();
  const [employerName, setEmployerName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isCurrent, setIsCurrent] = useState(false);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<{ kind: "error" | "success"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleAdd() {
    setStatus(null);
    if (!employerName.trim() || !roleTitle.trim()) {
      setStatus({ kind: "error", message: "Enter an employer and a role title." });
      return;
    }
    if (!startDate) {
      setStatus({ kind: "error", message: "Enter a start date." });
      return;
    }
    if (!isCurrent && !endDate) {
      setStatus({ kind: "error", message: "Enter an end date, or check “currently working here.”" });
      return;
    }
    if (!isCurrent && endDate < startDate) {
      setStatus({ kind: "error", message: "End date can't be before the start date." });
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setStatus({ kind: "error", message: "Your session has expired — please sign in again." });
      setBusy(false);
      return;
    }

    const { error } = await supabase.from("talent_work_experience").insert({
      talent_id: user.id,
      employer_name: employerName.trim(),
      role_title: roleTitle.trim(),
      start_date: startDate,
      end_date: isCurrent ? null : endDate,
      description: description.trim() || null,
    });
    setBusy(false);
    if (error) {
      setStatus({ kind: "error", message: `Could not save this: ${error.message}` });
      return;
    }

    setEmployerName("");
    setRoleTitle("");
    setStartDate("");
    setEndDate("");
    setIsCurrent(false);
    setDescription("");
    setStatus({ kind: "success", message: "Added." });
    router.refresh();
  }

  async function handleDelete(id: string) {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("talent_work_experience").delete().eq("id", id);
    setBusy(false);
    if (error) {
      setStatus({ kind: "error", message: `Could not remove this: ${error.message}` });
      return;
    }
    router.refresh();
  }

  // Same full-resequencing reasoning as portfolio-manager.tsx's handleMove.
  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;

    const reordered = [...items];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

    setBusy(true);
    const supabase = createClient();
    const results = await Promise.all(
      reordered.map((item, i) => supabase.from("talent_work_experience").update({ sort_order: i }).eq("id", item.id))
    );
    setBusy(false);
    const failed = results.find((r) => r.error);
    if (failed) {
      setStatus({ kind: "error", message: `Could not reorder: ${failed.error?.message}` });
      return;
    }
    router.refresh();
  }

  function formatRange(start: string, end: string | null) {
    const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short" });
    return `${fmt(start)} – ${end ? fmt(end) : "Present"}`;
  }

  return (
    <div className="mt-4">
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-slate/15 bg-white p-3"
            >
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  disabled={busy || index === 0}
                  onClick={() => handleMove(index, -1)}
                  aria-label="Move up"
                  className="text-xs text-slate disabled:opacity-30"
                >
                  &uarr;
                </button>
                <button
                  type="button"
                  disabled={busy || index === items.length - 1}
                  onClick={() => handleMove(index, 1)}
                  aria-label="Move down"
                  className="text-xs text-slate disabled:opacity-30"
                >
                  &darr;
                </button>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-midnight">{item.role_title}</p>
                <p className="text-xs text-slate">{item.employer_name}</p>
                <p className="text-xs text-slate">{formatRange(item.start_date, item.end_date)}</p>
                {item.description && <p className="mt-1 text-xs text-slate">{item.description}</p>}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleDelete(item.id)}
                className="text-xs font-semibold text-coral-ink disabled:opacity-60"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-2 rounded-lg border border-slate/15 bg-cloud/40 p-3">
        <input
          placeholder="Employer"
          value={employerName}
          onChange={(e) => setEmployerName(e.target.value)}
          className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        <input
          placeholder="Role title"
          value={roleTitle}
          onChange={(e) => setRoleTitle(e.target.value)}
          className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-slate">
            Start date
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex-1 text-xs text-slate">
            End date
            <input
              type="date"
              value={endDate}
              disabled={isCurrent}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm disabled:opacity-50"
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate">
          <input
            type="checkbox"
            checked={isCurrent}
            onChange={(e) => {
              setIsCurrent(e.target.checked);
              if (e.target.checked) setEndDate("");
            }}
            className="accent-teal"
          />
          I currently work here
        </label>
        <textarea
          placeholder="What did you do here? (optional)"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        {status && (
          <p className={`text-sm ${status.kind === "error" ? "text-coral-ink" : "text-teal-ink"}`}>{status.message}</p>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={handleAdd}
          className="w-full rounded-lg bg-teal px-4 py-2 text-sm font-bold text-midnight disabled:opacity-60"
        >
          {busy ? "Saving…" : "Add work experience"}
        </button>
      </div>
    </div>
  );
}
