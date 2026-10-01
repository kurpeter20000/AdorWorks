"use client";

import { useState } from "react";
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
  Timeline,
  api,
  fmtDate,
  humanize,
  inputClass,
  qs,
  useAction,
  useStaffData,
} from "../_components/staff-ui";
import { updateDispute } from "@/lib/actions/disputes";
import type { DisputeOutcome } from "@/lib/domain/disputes";
import { OutcomeFields } from "../_components/outcome-fields";

/* eslint-disable @typescript-eslint/no-explicit-any -- staff API payloads are untyped JSON from backend/api */
type Row = any;

const FILTERS: [string, string][] = [
  ["", "All"],
  ["proposed", "Proposed"],
  ["contracted", "Contracted"],
  ["active", "Active"],
  ["completed", "Completed"],
  ["disputed", "Disputed"],
  ["cancelled", "Cancelled"],
];
const ENGAGEMENT_STATUSES = ["proposed", "contracted", "active", "completed", "cancelled", "disputed"];
const DISPUTE_STATUSES = ["open", "investigating", "resolved", "escalated"];
const FINANCE_TYPES = ["deposit", "invoice", "fee", "payout", "refund"];

export function EngagementsConsole({ isFinanceStaff, initialFilter }: { isFinanceStaff: boolean; initialFilter: string }) {
  const [filter, setFilter] = useState(initialFilter);
  const list = useStaffData<{ data: Row[] }>(`/api/engagements${qs({ status: filter, limit: 100 })}`);

  return (
    <>
      <PageHeader
        title="Engagements"
        description="Delivery tracking, milestones, finance records (manual tracking only), reviews and disputes — everything for one confirmed piece of work in one place."
      />
      <FilterBar>
        <Chips label="Status" value={filter} onChange={setFilter} options={FILTERS} />
      </FilterBar>
      <StaffTable
        columns={["Organisation", "Talent", "Contract type", "Status", "Created"]}
        rows={list.data?.data ?? null}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        rowKey={(r) => r.id}
        cells={(r) => [r.organisations?.name || "—", r.talent_profiles?.headline || "—", humanize(r.contract_type), <Badge key="s" value={r.status} />, fmtDate(r.created_at)]}
        detail={(r) => (
          <DetailLoader<{ data: Row }> path={`/api/engagements/${r.id}`}>
            {(res, reload) => (
              <EngagementDetail
                d={res.data}
                isFinanceStaff={isFinanceStaff}
                onChanged={() => {
                  reload();
                  list.reload();
                }}
              />
            )}
          </DetailLoader>
        )}
        empty="No engagements match this filter."
      />
    </>
  );
}

function EngagementDetail({ d, isFinanceStaff, onChanged }: { d: Row; isFinanceStaff: boolean; onChanged: () => void }) {
  const e = d.engagement;
  const { run, pending, status, setStatus } = useAction(onChanged);
  const [newStatus, setNewStatus] = useState<string>(e.status);
  const [milestone, setMilestone] = useState("");
  const [note, setNote] = useState("");
  const [fin, setFin] = useState({ record_type: "deposit", amount: "", currency: "SSP", notes: "" });

  return (
    <div onClick={(ev) => ev.stopPropagation()}>
      <Grid2>
        <div>
          <KV
            items={[
              ["Opportunity", e.opportunities?.title || "—"],
              ["Scope", e.scope || "—"],
              ["Contract type", humanize(e.contract_type)],
              ["Started / completed", `${fmtDate(e.started_at)} · ${fmtDate(e.completed_at)}`],
            ]}
          />
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select aria-label="Engagement status" className={inputClass} value={newStatus} onChange={(ev) => setNewStatus(ev.target.value)}>
              {ENGAGEMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </select>
            <Btn variant="primary" disabled={pending} onClick={() => run(() => api(`/api/engagements/${e.id}`, { method: "PATCH", body: { status: newStatus } }))}>
              Update status
            </Btn>
          </div>

          <SubHeading>Milestones</SubHeading>
          {(e.milestones || []).length === 0 ? (
            <p className="text-sm text-slate">No milestones yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {(e.milestones as Row[]).map((m, i) => (
                <li key={i}>
                  {m.done ? "✅" : "⬜"} {m.title || JSON.stringify(m)}
                </li>
              ))}
            </ul>
          )}
          <form
            className="mt-2 flex flex-col gap-2 sm:flex-row"
            onSubmit={async (ev) => {
              ev.preventDefault();
              if (!milestone.trim()) return;
              const ok = await run(
                () =>
                  api(`/api/engagements/${e.id}`, {
                    method: "PATCH",
                    body: { milestones: [...(e.milestones || []), { title: milestone.trim(), done: false }] },
                  }),
                "Milestone added."
              );
              if (ok) setMilestone("");
            }}
          >
            <input aria-label="New milestone title" className={inputClass} placeholder="New milestone title" value={milestone} onChange={(ev) => setMilestone(ev.target.value)} />
            <Btn type="submit" disabled={pending}>
              Add milestone
            </Btn>
          </form>

          <SubHeading>Add a note</SubHeading>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={async (ev) => {
              ev.preventDefault();
              if (!note.trim()) return;
              const ok = await run(() => api(`/api/engagements/${e.id}/notes`, { method: "POST", body: { note: note.trim() } }), "Note added.");
              if (ok) setNote("");
            }}
          >
            <input aria-label="Note" className={inputClass} placeholder="Call summary, decision, etc." value={note} onChange={(ev) => setNote(ev.target.value)} />
            <Btn type="submit" disabled={pending}>
              Add note
            </Btn>
          </form>

          <SubHeading>Audit trail</SubHeading>
          <Timeline
            empty="No events yet."
            items={(d.events as Row[]).map((ev, i) => ({
              key: `${ev.created_at}-${i}`,
              when: ev.created_at,
              body: `${humanize(ev.event_type)}${ev.new_value ? `: ${ev.new_value}` : ""}`,
            }))}
          />
          <ActionStatus status={status} />
        </div>

        <div>
          <SubHeading>Finance (manual tracking)</SubHeading>
          {d.finance_records.length === 0 ? (
            <p className="text-sm text-slate">No finance records yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {(d.finance_records as Row[]).map((f) => (
                <li key={f.id}>
                  {humanize(f.record_type)} {f.amount} {f.currency} <Badge value={f.status} />
                  {f.notes ? ` — ${f.notes}` : ""}
                </li>
              ))}
            </ul>
          )}
          {isFinanceStaff ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <select aria-label="Record type" className={inputClass} value={fin.record_type} onChange={(ev) => setFin({ ...fin, record_type: ev.target.value })}>
                {FINANCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </select>
              <input
                aria-label="Amount"
                type="number"
                min={0}
                step="0.01"
                className={inputClass}
                placeholder="Amount"
                value={fin.amount}
                onChange={(ev) => setFin({ ...fin, amount: ev.target.value })}
              />
              <input aria-label="Currency" className={inputClass} placeholder="Currency" value={fin.currency} onChange={(ev) => setFin({ ...fin, currency: ev.target.value })} />
              <input aria-label="Finance notes" className={inputClass} placeholder="Notes (optional)" value={fin.notes} onChange={(ev) => setFin({ ...fin, notes: ev.target.value })} />
              <div className="sm:col-span-2">
                <Btn
                  disabled={pending}
                  onClick={async () => {
                    if (!fin.amount) {
                      setStatus({ kind: "error", message: "Enter an amount first." });
                      return;
                    }
                    const ok = await run(
                      () =>
                        api("/api/finance", {
                          method: "POST",
                          body: {
                            engagement_id: e.id,
                            record_type: fin.record_type,
                            amount: Number(fin.amount),
                            currency: fin.currency || "SSP",
                            notes: fin.notes || undefined,
                          },
                        }),
                      "Recorded."
                    );
                    if (ok) setFin({ ...fin, amount: "", notes: "" });
                  }}
                >
                  Record entry (manual tracking only)
                </Btn>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-xs text-slate">Only finance/admin staff can record entries.</p>
          )}

          <SubHeading>Reviews</SubHeading>
          {d.reviews.length === 0 ? (
            <p className="text-sm text-slate">No reviews yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {(d.reviews as Row[]).map((r, i) => (
                <li key={r.id ?? i}>
                  {humanize(r.reviewer_role)} rated {r.rating}/5{r.feedback ? ` — ${r.feedback}` : ""}
                </li>
              ))}
            </ul>
          )}

          <SubHeading>Disputes</SubHeading>
          {d.disputes.length === 0 ? (
            <p className="text-sm text-slate">No disputes on this engagement.</p>
          ) : (
            <ul className="space-y-3">
              {(d.disputes as Row[]).map((disp) => (
                <DisputeEditor key={disp.id} dispute={disp} onSaved={onChanged} />
              ))}
            </ul>
          )}
        </div>
      </Grid2>
    </div>
  );
}

function DisputeEditor({ dispute, onSaved }: { dispute: Row; onSaved: () => void }) {
  const [status, setStatusValue] = useState<string>(dispute.status);
  const [resolution, setResolution] = useState<string>(dispute.resolution || "");
  const [outcome, setOutcome] = useState<string>(dispute.outcome || "");
  const [outcomeSummary, setOutcomeSummary] = useState<string>(dispute.outcome_summary || "");
  const action = useAction(onSaved);
  return (
    <li className="rounded-lg border border-slate/15 bg-white p-3 text-sm">
      <p>
        {dispute.description} <Badge value={dispute.status} />
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <select aria-label="Dispute status" className={inputClass} value={status} onChange={(ev) => setStatusValue(ev.target.value)}>
          {DISPUTE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </select>
        <input aria-label="Internal resolution notes" className={inputClass} placeholder="Internal notes (staff only)" value={resolution} onChange={(ev) => setResolution(ev.target.value)} />
      </div>
      {status === "resolved" && (
        <OutcomeFields outcome={outcome} setOutcome={setOutcome} summary={outcomeSummary} setSummary={setOutcomeSummary} />
      )}
      <div className="mt-2">
        <Btn
          disabled={action.pending}
          onClick={() =>
            action.run(async () => {
              const r = await updateDispute(dispute.id, { status: status as "resolved", resolution: resolution || undefined, outcome: (outcome || undefined) as DisputeOutcome | undefined, outcomeSummary: outcomeSummary || undefined });
              if (r.error) throw new Error(r.error);
            })
          }
        >
          Save
        </Btn>
      </div>
      <ActionStatus status={action.status} />
    </li>
  );
}
