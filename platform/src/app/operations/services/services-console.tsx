"use client";

import { useState } from "react";
import {
  ActionRow,
  ActionStatus,
  Badge,
  Btn,
  Chips,
  FilterBar,
  KV,
  PageHeader,
  ReasonAction,
  StaffTable,
  api,
  fmtDate,
  humanize,
  inputClass,
  money,
  qs,
  useAction,
  useStaffData,
} from "../_components/staff-ui";

/* eslint-disable @typescript-eslint/no-explicit-any -- staff API payloads are untyped JSON from backend/api */
type Row = any;

const FILTERS: [string, string][] = [
  ["pending_review", "Pending review"],
  ["published", "Published"],
  ["paused", "Paused"],
  ["rejected", "Rejected"],
  ["", "All"],
];

export function ServicesConsole({ initialFilter }: { initialFilter: string }) {
  const [filter, setFilter] = useState(initialFilter);
  const list = useStaffData<{ data: Row[] }>(`/api/talent-services${qs({ status: filter, limit: 100 })}`);

  return (
    <>
      <PageHeader
        title="Services"
        description="Talent-authored services from Service Studio. Publishing puts a service on Browse Services; rejecting sends it back to the talent with a reason so they can revise and resubmit."
      />
      <FilterBar>
        <Chips label="Status" value={filter} onChange={setFilter} options={FILTERS} />
      </FilterBar>
      <StaffTable
        columns={["Title", "Talent", "Category", "Price", "Status", "Submitted"]}
        rows={list.data?.data ?? null}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        rowKey={(r) => r.id}
        cells={(r) => [
          r.title,
          r.talent_profiles?.headline || r.talent_id,
          humanize(r.category),
          r.price ? money(r.price, r.currency) : "—",
          <Badge key="s" value={r.status} />,
          fmtDate(r.created_at),
        ]}
        detail={(r) => <ServiceDetail row={r} onChanged={list.reload} />}
        empty="No services match this filter."
      />
    </>
  );
}

function ServiceDetail({ row, onChanged }: { row: Row; onChanged: () => void }) {
  const { run, pending, status } = useAction(onChanged);
  const [pauseNote, setPauseNote] = useState("");

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <KV
        items={[
          ["Talent", row.talent_profiles?.headline || row.talent_id],
          ["Problem solved", row.problem_solved || "—"],
          ["Deliverables", row.deliverables || "—"],
          ["Excludes", row.exclusions || "—"],
          ["Turnaround", row.turnaround || "—"],
          ...(row.status === "rejected" || row.status === "paused"
            ? ([[row.status === "paused" ? "Pause note" : "Rejection reason", row.status_note || "—"]] as [string, string][])
            : []),
        ]}
      />
      {row.status === "pending_review" && (
        <div className="mt-3 space-y-2">
          <ActionRow>
            <Btn variant="primary" disabled={pending} onClick={() => run(() => api(`/api/talent-services/${row.id}/publish`, { method: "POST", body: {} }), "Published.")}>
              Publish
            </Btn>
          </ActionRow>
          <ReasonAction
            label="Reject"
            placeholder="Reason for rejecting (required)"
            disabled={pending}
            onSubmit={(reason) => run(() => api(`/api/talent-services/${row.id}/reject`, { method: "POST", body: { reason } }), "Rejected.")}
          />
        </div>
      )}
      {row.status === "published" && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input aria-label="Reason for pausing" className={inputClass} placeholder="Reason for pausing (optional)" value={pauseNote} onChange={(e) => setPauseNote(e.target.value)} />
          <Btn
            disabled={pending}
            onClick={() => run(() => api(`/api/talent-services/${row.id}/pause`, { method: "POST", body: { note: pauseNote.trim() || undefined } }), "Paused.")}
          >
            Pause
          </Btn>
        </div>
      )}
      <ActionStatus status={status} />
    </div>
  );
}
