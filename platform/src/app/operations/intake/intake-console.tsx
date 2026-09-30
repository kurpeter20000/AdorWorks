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
  Select,
  StaffTable,
  api,
  fmtDateTime,
  humanize,
  qs,
  useAction,
  useStaffData,
} from "../_components/staff-ui";

/* eslint-disable @typescript-eslint/no-explicit-any -- staff API payloads are untyped JSON from backend/api */
type Row = any;

const STATUS: [string, string][] = [
  ["new", "New"],
  ["in_review", "In review"],
  ["converted", "Converted"],
  ["archived", "Archived"],
  ["", "All"],
];
const FORM_TYPES = ["talent_application", "employer_brief", "shortlist_request", "service_request", "general_contact", "insights_subscribe"];

export function intakeName(row: Row) {
  const p = row.payload ?? {};
  return p.name || p.organisation || p.representative_name || p.email || "—";
}

export function IntakeConsole({ initialStatus }: { initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [formType, setFormType] = useState("");
  const list = useStaffData<{ data: Row[] }>(`/api/intake${qs({ status, form_type: formType, limit: 100 })}`);

  return (
    <>
      <PageHeader
        title="Intake"
        description="Every public-form submission lands here first. Review one, then either convert it into a real talent profile or organisation, or archive it if it's not going anywhere."
      />
      <FilterBar>
        <Chips label="Status" value={status} onChange={setStatus} options={STATUS} />
        <Select label="Form type" value={formType} onChange={setFormType} options={FORM_TYPES} placeholder="All form types" />
      </FilterBar>
      <StaffTable
        columns={["Form", "Name", "Status", "Submitted"]}
        rows={list.data?.data ?? null}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        rowKey={(r) => r.id}
        cells={(r) => [humanize(r.form_type), intakeName(r), <Badge key="s" value={r.status} />, fmtDateTime(r.created_at)]}
        detail={(r) => <IntakeDetail row={r} onChanged={list.reload} />}
        empty="Nothing here."
      />
    </>
  );
}

function IntakeDetail({ row, onChanged }: { row: Row; onChanged: () => void }) {
  const { run, pending, status } = useAction(onChanged);
  const open = row.status !== "converted" && row.status !== "archived";

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <KV items={Object.entries(row.payload ?? {}).map(([k, v]) => [humanize(k), v === null || v === "" ? "—" : String(v)])} />
      {row.status === "converted" && (
        <p className="mt-3 text-xs text-slate">
          Converted to <code>{row.converted_to_table}</code> (id <code>{row.converted_to_id}</code>) on {fmtDateTime(row.reviewed_at)}.
        </p>
      )}
      {open && (
        <ActionRow>
          {row.status === "new" && (
            <Btn disabled={pending} onClick={() => run(() => api(`/api/intake/${row.id}`, { method: "PATCH", body: { status: "in_review" } }), "Marked in review.")}>
              Mark in review
            </Btn>
          )}
          {row.form_type === "talent_application" && (
            <Btn
              variant="primary"
              disabled={pending}
              onClick={() => run(() => api(`/api/intake/${row.id}/convert-talent`, { method: "POST", body: {} }), "Converted — the applicant has been emailed an invite.")}
            >
              Convert to talent profile
            </Btn>
          )}
          {row.form_type === "employer_brief" && (
            <Btn
              variant="primary"
              disabled={pending}
              onClick={() => run(() => api(`/api/intake/${row.id}/convert-employer`, { method: "POST", body: {} }), "Converted to an organisation and draft opportunity.")}
            >
              Convert to organisation + opportunity
            </Btn>
          )}
          <Btn disabled={pending} onClick={() => run(() => api(`/api/intake/${row.id}`, { method: "PATCH", body: { status: "archived" } }), "Archived.")}>
            Archive
          </Btn>
        </ActionRow>
      )}
      <ActionStatus status={status} />
    </div>
  );
}
