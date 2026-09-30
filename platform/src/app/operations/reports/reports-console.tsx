"use client";

import { useState } from "react";
import {
  ActionRow,
  ActionStatus,
  Badge,
  Btn,
  Chips,
  Field,
  FilterBar,
  KV,
  PageHeader,
  StaffTable,
  api,
  fmtDateTime,
  humanize,
  inputClass,
  qs,
  useAction,
  useStaffData,
} from "../_components/staff-ui";

/* eslint-disable @typescript-eslint/no-explicit-any -- staff API payloads are untyped JSON from backend/api */
type Row = any;

const FILTERS: [string, string][] = [
  ["open", "Open"],
  ["reviewed", "Reviewed"],
  ["dismissed", "Dismissed"],
  ["actioned", "Actioned"],
  ["", "All"],
];
// Own tones: "open" here means "needs attention", not "live and good".
const STATUS_TONE = { open: "warning", reviewed: "info", dismissed: "neutral", actioned: "success" } as const;
const SEVERITY_TONE = { low: "neutral", medium: "info", high: "warning", critical: "danger" } as const;
const SEVERITIES = ["low", "medium", "high", "critical"] as const;

export function ReportsConsole({ me, initialFilter }: { me: string; initialFilter: string }) {
  const [filter, setFilter] = useState(initialFilter);
  const list = useStaffData<{ data: Row[] }>(`/api/reports${qs({ status: filter, limit: 100 })}`);

  return (
    <>
      <PageHeader title="Reports" description="Listings and profiles flagged as spam, scams, or otherwise abusive by talent or employers." />
      <FilterBar>
        <Chips label="Status" value={filter} onChange={setFilter} options={FILTERS} />
      </FilterBar>
      <StaffTable
        columns={["Target", "Reason", "Severity", "Assigned", "Status", "Filed"]}
        rows={list.data?.data ?? null}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        rowKey={(r) => r.id}
        cells={(r) => [
          `${humanize(r.target_type)} — ${r.target_id}`,
          humanize(r.reason),
          r.severity ? (
            <Badge key="sev" value={r.severity} tone={SEVERITY_TONE[r.severity as keyof typeof SEVERITY_TONE]} />
          ) : (
            <Badge key="sev" value="unset" tone="neutral" />
          ),
          r.assigned_to === me ? "You" : r.assigned_to ? "Assigned" : "Unassigned",
          <Badge key="st" value={r.status} tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE]} />,
          fmtDateTime(r.created_at),
        ]}
        detail={(r) => <ReportDetail row={r} me={me} onChanged={list.reload} />}
        empty="No reports match this filter."
      />
    </>
  );
}

function ReportDetail({ row, me, onChanged }: { row: Row; me: string; onChanged: () => void }) {
  const { run, pending, status, setStatus } = useAction(onChanged);
  const [severity, setSeverity] = useState<string>(row.severity ?? "");
  const [notes, setNotes] = useState("");

  function resolve(next: "reviewed" | "dismissed" | "actioned") {
    if (notes.trim().length < 5) {
      setStatus({ kind: "error", message: "Say what you did and why before resolving this." });
      return;
    }
    run(() => api(`/api/reports/${row.id}`, { method: "PATCH", body: { status: next, resolution_notes: notes.trim() } }), "Updated.");
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <KV
        items={[
          ["Target type", humanize(row.target_type)],
          ["Target ID", <code key="id">{row.target_id}</code>],
          ["Reported by", row.profiles?.full_name || "—"],
          ["Note", row.note || "—"],
          ["Resolution notes", row.resolution_notes || "—"],
        ]}
      />
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field label="Severity">
          <select className={`${inputClass} sm:w-48`} value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="">— unset —</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Btn
          disabled={pending}
          onClick={() => {
            if (!severity) {
              setStatus({ kind: "error", message: "Choose a severity first." });
              return;
            }
            run(() => api(`/api/reports/${row.id}/severity`, { method: "PATCH", body: { severity } }), "Severity set.");
          }}
        >
          Set severity
        </Btn>
        {row.assigned_to === me ? (
          <Btn disabled={pending} onClick={() => run(() => api(`/api/reports/${row.id}/assign`, { method: "PATCH", body: { assigned_to: null } }), "Unassigned.")}>
            Unassign
          </Btn>
        ) : (
          <Btn disabled={pending} onClick={() => run(() => api(`/api/reports/${row.id}/assign`, { method: "PATCH", body: { assigned_to: me } }), "Assigned to you.")}>
            Assign to me
          </Btn>
        )}
      </div>
      {row.status === "open" && (
        <div className="mt-4">
          <Field label="What did you do, and why? (required)">
            <textarea rows={2} className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <ActionRow>
            <Btn disabled={pending} onClick={() => resolve("reviewed")}>
              Mark reviewed
            </Btn>
            <Btn disabled={pending} onClick={() => resolve("dismissed")}>
              Dismiss
            </Btn>
            <Btn variant="primary" disabled={pending} onClick={() => resolve("actioned")}>
              Mark actioned
            </Btn>
          </ActionRow>
        </div>
      )}
      <ActionStatus status={status} />
    </div>
  );
}
