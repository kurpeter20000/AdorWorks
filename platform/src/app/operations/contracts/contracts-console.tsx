"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ActionStatus,
  Badge,
  Btn,
  Chips,
  DetailLoader,
  FilterBar,
  Grid2,
  KV,
  PageHeader,
  StaffTable,
  SubHeading,
  api,
  fmtDate,
  fmtDateTime,
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
  ["", "All"],
  ["active", "Active"],
  ["completed", "Completed"],
  ["disputed", "Disputed"],
  ["cancelled", "Cancelled"],
];
const DISPUTE_STATUSES = ["open", "investigating", "resolved", "escalated"];
const FINANCE_STATUSES = ["pending", "confirmed", "reconciled", "cancelled"];

const newestFirst = (key: string) => (a: Row, b: Row) => +new Date(b[key]) - +new Date(a[key]);

export function ContractsConsole({ initialFilter }: { initialFilter: string }) {
  const [filter, setFilter] = useState(initialFilter);
  const list = useStaffData<{ data: Row[] }>(`/api/contracts${qs({ status: filter, limit: 100 })}`);

  return (
    <>
      <PageHeader
        title="Contracts"
        description="Oversight of the self-service offer → accept → deliver → pay → review flow. Delivery happens in the app itself; here staff handle disputes, refunds and invoice reconciliation."
      />
      <FilterBar>
        <Chips label="Status" value={filter} onChange={setFilter} options={FILTERS} />
      </FilterBar>
      <StaffTable
        columns={["Opportunity", "Talent", "Organisation", "Status", "Started"]}
        rows={list.data?.data ?? null}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        rowKey={(r) => r.id}
        cells={(r) => [
          r.opportunities?.title || "—",
          r.talent_profiles?.display_name || r.talent_profiles?.headline || "—",
          r.organisations?.name || "—",
          <Badge key="s" value={r.status} />,
          fmtDate(r.started_at),
        ]}
        detail={(r) => (
          <DetailLoader<{ data: Row }> path={`/api/contracts/${r.id}`}>
            {(res, reload) => (
              <ContractDetail
                c={res.data}
                onChanged={() => {
                  reload();
                  list.reload();
                }}
              />
            )}
          </DetailLoader>
        )}
        empty="No contracts match this filter."
      />
    </>
  );
}

function ContractDetail({ c, onChanged }: { c: Row; onChanged: () => void }) {
  const milestones: Row[] = [...(c.milestones || [])].sort((a, b) => a.sequence - b.sequence);
  const invoices: Row[] = (c.finance_records || []).filter((f: Row) => f.record_type === "invoice").sort(newestFirst("created_at"));
  const intentions: Row[] = [...(c.payment_intentions || [])].sort(newestFirst("created_at"));
  const timesheets: Row[] = [...(c.timesheets || [])].sort(newestFirst("period_start"));
  const disputes: Row[] = [...(c.disputes || [])].sort(newestFirst("created_at"));

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <p className="mb-3 text-sm">
        <Link href={`/contracts/${c.id}`} className="font-semibold text-teal-ink underline">
          Open the contract workspace (messages, files)
        </Link>
      </p>
      <Grid2>
        <div>
          <SubHeading>Milestones</SubHeading>
          {!milestones.length && <p className="text-sm text-slate">No milestones.</p>}
          <ul className="space-y-3 text-sm">
            {milestones.map((m) => (
              <li key={m.id}>
                <strong>{m.title}</strong> — {money(m.amount, m.currency)} <Badge value={m.status} />
                <ul className="mt-1 space-y-1 border-l-2 border-slate/15 pl-3 text-xs">
                  {!(m.deliverables || []).length && <li className="text-slate">No submissions yet.</li>}
                  {[...(m.deliverables || [])].sort(newestFirst("created_at")).map((d: Row) => (
                    <li key={d.id}>
                      <Badge value={d.status} /> {d.note || "(no note)"}
                      {d.file_path ? " · file attached" : ""} <span className="text-slate">{fmtDateTime(d.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>

          <SubHeading>Payments (simulated — no real payment provider)</SubHeading>
          {!(c.payment_events || []).length && <p className="text-sm text-slate">No payment events yet.</p>}
          <ul className="space-y-1 text-sm">
            {(c.payment_events || []).map((p: Row) => (
              <li key={p.id}>
                {money(p.amount, p.currency)} <Badge value={p.status} />
                {p.is_simulated ? " (simulated)" : ""} <span className="text-xs text-slate">{fmtDateTime(p.created_at)}</span>
              </li>
            ))}
          </ul>

          <SubHeading>Timesheets</SubHeading>
          {!timesheets.length && <p className="text-sm text-slate">No timesheets logged.</p>}
          <ul className="space-y-1 text-sm">
            {timesheets.map((t) => (
              <li key={t.id}>
                {fmtDate(t.period_start)} – {fmtDate(t.period_end)} · {t.hours}h <Badge value={t.status} />
              </li>
            ))}
          </ul>

          <SubHeading>Details</SubHeading>
          <KV
            items={[
              ["Started", fmtDate(c.started_at)],
              ["Completed", fmtDate(c.completed_at)],
              ...(c.cancelled_at
                ? ([
                    ["Cancelled", fmtDate(c.cancelled_at)],
                    ["Cancellation reason", c.cancellation_reason || "—"],
                  ] as [string, string][])
                : []),
            ]}
          />
        </div>

        <div>
          <SubHeading>Invoices (reconcile once confirmed externally)</SubHeading>
          {!invoices.length && <p className="text-sm text-slate">No invoices yet.</p>}
          <ul className="space-y-2">
            {invoices.map((inv) => (
              <InvoiceRow key={inv.id} invoice={inv} onSaved={onChanged} />
            ))}
          </ul>

          <SubHeading>Payment attempts</SubHeading>
          {!intentions.length && <p className="text-sm text-slate">No payment attempts yet.</p>}
          <ul className="space-y-1 text-sm">
            {intentions.map((pi) => (
              <li key={pi.id}>
                {pi.provider} · {pi.card_last4 ? `${pi.card_brand || "Card"} ····${pi.card_last4}` : pi.payer_phone || "—"} · {money(pi.amount, pi.currency)}{" "}
                <Badge value={pi.status} />
                {pi.failure_reason ? ` — ${pi.failure_reason}` : ""} <span className="text-xs text-slate">{fmtDateTime(pi.created_at)}</span>
              </li>
            ))}
          </ul>

          <SubHeading>Reviews</SubHeading>
          {!(c.reviews || []).length && <p className="text-sm text-slate">No reviews yet.</p>}
          <ul className="space-y-1 text-sm">
            {(c.reviews || []).map((r: Row, i: number) => (
              <li key={r.id ?? i}>
                <strong>{humanize(r.reviewer_role)}</strong> — <span aria-label={`${r.rating} out of 5`}>{"★".repeat(r.rating)}</span>
                {r.feedback ? ` — ${r.feedback}` : ""}
              </li>
            ))}
          </ul>

          <SubHeading>Disputes</SubHeading>
          {!disputes.length && <p className="text-sm text-slate">No disputes.</p>}
          <ul className="space-y-3">
            {disputes.map((d) => (
              <ContractDispute key={d.id} dispute={d} milestones={milestones} onSaved={onChanged} />
            ))}
          </ul>
        </div>
      </Grid2>
    </div>
  );
}

function InvoiceRow({ invoice, onSaved }: { invoice: Row; onSaved: () => void }) {
  const [status, setStatusValue] = useState<string>(invoice.status);
  const action = useAction(onSaved);
  return (
    <li className="text-sm">
      {money(invoice.amount, invoice.currency)} <Badge value={invoice.status} /> <span className="text-xs text-slate">{fmtDateTime(invoice.created_at)}</span>
      <div className="mt-1 flex flex-col gap-2 sm:flex-row">
        <select aria-label="Invoice status" className={inputClass} value={status} onChange={(e) => setStatusValue(e.target.value)}>
          {FINANCE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </select>
        <Btn disabled={action.pending} onClick={() => action.run(() => api(`/api/finance/${invoice.id}`, { method: "PATCH", body: { status } }))}>
          Save
        </Btn>
      </div>
      <ActionStatus status={action.status} />
    </li>
  );
}

function ContractDispute({ dispute, milestones, onSaved }: { dispute: Row; milestones: Row[]; onSaved: () => void }) {
  const [status, setStatusValue] = useState<string>(dispute.status);
  const [resolution, setResolution] = useState<string>(dispute.resolution || "");
  const [refundMilestone, setRefundMilestone] = useState("");
  const [refundNotes, setRefundNotes] = useState("");
  const action = useAction(onSaved);

  return (
    <li className="rounded-lg border border-slate/15 bg-white p-3 text-sm">
      <p>
        {dispute.description} <Badge value={dispute.status} />
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <select aria-label="Dispute status" className={inputClass} value={status} onChange={(e) => setStatusValue(e.target.value)}>
          {DISPUTE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </select>
        <input aria-label="Resolution notes" className={inputClass} placeholder="Resolution notes" value={resolution} onChange={(e) => setResolution(e.target.value)} />
      </div>
      <div className="mt-2">
        <Btn
          disabled={action.pending}
          onClick={() => action.run(() => api(`/api/disputes/${dispute.id}`, { method: "PATCH", body: { status, resolution: resolution || undefined } }))}
        >
          Save
        </Btn>
      </div>

      {milestones.length > 0 && (
        <div className="mt-3 border-t border-slate/10 pt-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <select aria-label="Refund which milestone" className={inputClass} value={refundMilestone} onChange={(e) => setRefundMilestone(e.target.value)}>
              <option value="">Refund which milestone?</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title} — {money(m.amount, m.currency)} ({humanize(m.status)})
                </option>
              ))}
            </select>
            <input aria-label="Refund notes" className={inputClass} placeholder="Refund notes (optional)" value={refundNotes} onChange={(e) => setRefundNotes(e.target.value)} />
          </div>
          <div className="mt-2">
            <Btn
              variant="danger"
              disabled={action.pending || !refundMilestone}
              onClick={() => {
                if (!window.confirm("Mark this milestone's settled payment as refunded and record a finance entry? This cannot be undone here.")) return;
                action.run(
                  () =>
                    api(`/api/disputes/${dispute.id}/refund`, {
                      method: "POST",
                      body: { milestone_id: refundMilestone, notes: refundNotes || undefined },
                    }),
                  "Refund recorded."
                );
              }}
            >
              Refund settled payment
            </Btn>
          </div>
        </div>
      )}
      <ActionStatus status={action.status} />
    </li>
  );
}
