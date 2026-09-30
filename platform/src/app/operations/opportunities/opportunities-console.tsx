"use client";

import { useState } from "react";
import Link from "next/link";
import { approveOpportunity, rejectOpportunity, requestOpportunityChanges } from "@/lib/actions/operations";
import {
  ActionRow,
  ActionStatus,
  Badge,
  Btn,
  Chips,
  Field,
  FilterBar,
  Grid2,
  KV,
  PageHeader,
  ReasonAction,
  StaffTable,
  SubHeading,
  api,
  fmtDate,
  fmtDateTime,
  formData,
  humanize,
  inputClass,
  qs,
  useAction,
  useStaffData,
  viaAction,
} from "../_components/staff-ui";

/* eslint-disable @typescript-eslint/no-explicit-any -- staff API payloads are untyped JSON from backend/api */
type Row = any;

const FILTERS: [string, string][] = [
  ["pending_review", "Pending review"],
  ["changes_required", "Changes requested"],
  ["open", "Open"],
  ["paused", "Paused"],
  ["filled", "Filled"],
  ["closed", "Closed"],
  ["expired", "Expired"],
  ["rejected", "Rejected"],
  ["", "All"],
];
const OPP_STATUSES = ["draft", "pending_review", "open", "filled", "closed", "cancelled", "rejected", "changes_required", "paused", "expired"];
const STAGES = ["submitted", "shortlisted", "interviewing", "offered", "accepted", "rejected", "withdrawn"];

export function OpportunitiesConsole({ initialFilter }: { initialFilter: string }) {
  const [filter, setFilter] = useState(initialFilter);
  const [creating, setCreating] = useState(false);
  const list = useStaffData<{ data: Row[] }>(`/api/opportunities${qs({ status: filter, limit: 100 })}`);

  return (
    <>
      <PageHeader
        title="Opportunities"
        description="Approve briefs, build shortlists (unless the employer shortlists themselves), and start an engagement once a candidate accepts."
        actions={
          <Btn variant={creating ? "secondary" : "primary"} onClick={() => setCreating((c) => !c)}>
            {creating ? "Close form" : "+ New opportunity"}
          </Btn>
        }
      />
      {creating && (
        <CreateOpportunity
          onCreated={() => {
            setCreating(false);
            list.reload();
          }}
        />
      )}
      <FilterBar>
        <Chips label="Status" value={filter} onChange={setFilter} options={FILTERS} />
      </FilterBar>
      <StaffTable
        columns={["Title", "Organisation", "Type", "Shortlisting", "Status", "Created"]}
        rows={list.data?.data ?? null}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        rowKey={(r) => r.id}
        cells={(r) => [
          r.title,
          r.organisations?.name || "—",
          humanize(r.type),
          r.shortlisting_mode === "self_service" ? <Badge key="m" value="Self-service" tone="info" /> : <Badge key="m" value="Staff" tone="neutral" />,
          <Badge key="s" value={r.status} />,
          fmtDate(r.created_at),
        ]}
        detail={(r) => <OpportunityDetail row={r} onChanged={list.reload} />}
        empty="No opportunities match this filter."
      />
    </>
  );
}

function CreateOpportunity({ onCreated }: { onCreated: () => void }) {
  const orgs = useStaffData<{ data: Row[] }>("/api/organisations?limit=200");
  const { run, pending, status } = useAction(onCreated);
  const [v, setV] = useState({
    organisation_id: "",
    type: "service",
    title: "",
    brief: "",
    category: "",
    skills: "",
    engagement_type: "freelance",
    payment_basis: "fixed",
    location: "",
    currency: "SSP",
    budget_min: "",
    budget_max: "",
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((prev) => ({ ...prev, [k]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const skills = v.skills.split(",").map((s) => s.trim()).filter(Boolean);
    const body: Record<string, unknown> = {
      organisation_id: v.organisation_id,
      type: v.type,
      title: v.title,
      brief: v.brief || undefined,
      category: v.category || undefined,
      skills: skills.length ? skills : undefined,
      engagement_type: v.engagement_type,
      payment_basis: v.payment_basis,
      location: v.location || undefined,
      currency: v.currency || undefined,
    };
    if (v.budget_min) body.budget_min = Number(v.budget_min);
    if (v.budget_max) body.budget_max = Number(v.budget_max);
    run(() => api("/api/opportunities", { method: "POST", body }), "Created.");
  }

  return (
    <form onSubmit={submit} className="mb-6 grid gap-3 rounded-xl border border-slate/15 bg-white p-4 sm:grid-cols-2">
      <h2 className="text-base font-bold text-midnight sm:col-span-2">New opportunity</h2>
      <Field label="Organisation">
        <select required className={inputClass} value={v.organisation_id} onChange={set("organisation_id")}>
          <option value="">{orgs.data ? "Choose…" : "Loading…"}</option>
          {(orgs.data?.data ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} ({humanize(o.verification_status)})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Type">
        <select required className={inputClass} value={v.type} onChange={set("type")}>
          {[
            ["service", "Service"],
            ["project", "Project"],
            ["contract", "Contract"],
            ["full_time", "Full-time"],
            ["squad", "Squad"],
          ].map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Title">
          <input required className={inputClass} value={v.title} onChange={set("title")} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Brief">
          <textarea rows={3} className={inputClass} value={v.brief} onChange={set("brief")} />
        </Field>
      </div>
      <Field label="Category">
        <select required className={inputClass} value={v.category} onChange={set("category")}>
          <option value="">—</option>
          <option value="creative_media">Creative &amp; media</option>
          <option value="digital_technology">Digital &amp; technology</option>
          <option value="business_project_support">Business &amp; project support</option>
        </select>
      </Field>
      <Field label="Skills (comma-separated, at least one)">
        <input required className={inputClass} value={v.skills} onChange={set("skills")} />
      </Field>
      <Field label="Engagement type">
        <select className={inputClass} value={v.engagement_type} onChange={set("engagement_type")}>
          {["freelance", "fixed_term_contract", "full_time", "internship", "apprenticeship", "managed_service"].map((k) => (
            <option key={k} value={k}>
              {humanize(k)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Paid">
        <select className={inputClass} value={v.payment_basis} onChange={set("payment_basis")}>
          {[
            ["fixed", "Fixed price"],
            ["milestone", "Per milestone"],
            ["hourly", "Hourly"],
            ["daily", "Daily"],
            ["monthly", "Monthly"],
            ["negotiable", "Negotiable"],
          ].map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Location / work mode">
        <input className={inputClass} value={v.location} onChange={set("location")} />
      </Field>
      <Field label="Currency">
        <input className={inputClass} value={v.currency} onChange={set("currency")} />
      </Field>
      <Field label="Budget min" hint="At least one of min or max is required.">
        <input type="number" min={0} className={inputClass} value={v.budget_min} onChange={set("budget_min")} />
      </Field>
      <Field label="Budget max">
        <input type="number" min={0} className={inputClass} value={v.budget_max} onChange={set("budget_max")} />
      </Field>
      <div className="sm:col-span-2">
        <Btn type="submit" variant="primary" disabled={pending}>
          Create opportunity
        </Btn>
        <ActionStatus status={status} />
      </div>
    </form>
  );
}

function OpportunityDetail({ row, onChanged }: { row: Row; onChanged: () => void }) {
  const { run, pending, status } = useAction(onChanged);
  const [newStatus, setNewStatus] = useState<string>(row.status);
  const [pauseNote, setPauseNote] = useState("");

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Grid2>
        <div>
          <KV
            items={[
              ["Brief", row.brief || "—"],
              ...(row.service_packages ? ([["Package", row.service_packages.title]] as [string, string][]) : []),
              ["Skills", (row.skills || []).join(", ") || "—"],
              ["Location", row.location || "—"],
              ["Budget", `${row.budget_min || "—"}–${row.budget_max || "—"} ${row.currency || ""}`],
              ...(row.status === "rejected" ? ([["Rejection reason", row.rejection_reason || "—"]] as [string, string][]) : []),
              ...(row.status === "rejected" && row.appeal_note ? ([["Appeal", row.appeal_note]] as [string, string][]) : []),
              ...(row.status === "changes_required" || row.status === "paused"
                ? ([[row.status === "paused" ? "Pause note" : "Requested changes", row.status_note || "—"]] as [string, string][])
                : []),
            ]}
          />
          {row.status === "open" && (
            <p className="mt-2 text-sm">
              <Link href={`/jobs/${row.id}`} className="font-semibold text-teal-ink underline" target="_blank">
                View public job page
              </Link>
            </p>
          )}

          {row.status === "pending_review" && (
            <div className="mt-4 space-y-2">
              <SubHeading>Review</SubHeading>
              <p className="text-xs text-slate">The employer is notified in the app and by email for each decision.</p>
              <Btn variant="primary" disabled={pending} onClick={() => run(() => viaAction(approveOpportunity(row.id)), "Approved and published.")}>
                Approve &amp; open
              </Btn>
              <ReasonAction
                label="Reject"
                placeholder="Reason for rejecting (at least 10 characters)"
                disabled={pending}
                onSubmit={(reason) => run(() => viaAction(rejectOpportunity(row.id, {}, formData({ reason }))), "Rejected.")}
              />
              <ReasonAction
                label="Request changes"
                variant="secondary"
                placeholder="What needs to change (at least 10 characters)"
                disabled={pending}
                onSubmit={(note) => run(() => viaAction(requestOpportunityChanges(row.id, {}, formData({ note }))), "Changes requested.")}
              />
            </div>
          )}
          {row.status === "open" && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                aria-label="Reason for pausing"
                className={inputClass}
                placeholder="Reason for pausing (optional)"
                value={pauseNote}
                onChange={(e) => setPauseNote(e.target.value)}
              />
              <Btn
                disabled={pending}
                onClick={() => run(() => api(`/api/opportunities/${row.id}/pause`, { method: "POST", body: { note: pauseNote.trim() || undefined } }), "Paused.")}
              >
                Pause
              </Btn>
            </div>
          )}
          {row.status === "rejected" && (
            <div className="mt-4">
              <ReasonAction
                label="Reopen for changes"
                variant="secondary"
                placeholder="What needs to change to reopen this (required)"
                disabled={pending}
                onSubmit={(note) => run(() => api(`/api/opportunities/${row.id}/request-changes`, { method: "POST", body: { note } }), "Reopened for changes.")}
              />
            </div>
          )}

          <SubHeading>Set status directly</SubHeading>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select aria-label="Status" className={inputClass} value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
              {OPP_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </select>
            <Btn disabled={pending} onClick={() => run(() => api(`/api/opportunities/${row.id}`, { method: "PATCH", body: { status: newStatus } }))}>
              Update status
            </Btn>
          </div>
          <ActionStatus status={status} />
        </div>

        <Shortlist opportunity={row} />
      </Grid2>
    </div>
  );
}

function Shortlist({ opportunity }: { opportunity: Row }) {
  const apps = useStaffData<{ data: Row[] }>(`/api/applications${qs({ opportunity_id: opportunity.id, limit: 100 })}`);
  const suggested = useStaffData<{ data: Row[] }>(
    opportunity.category ? `/api/talent${qs({ category: opportunity.category, limit: 100 })}` : null
  );
  const { run, pending, status } = useAction(apps.reload);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Row[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const shortlisted = new Set((apps.data?.data ?? []).map((a) => a.talent_id));
  const oppSkills = (opportunity.skills || []).map((s: string) => s.toLowerCase());
  const candidates = (suggested.data?.data ?? [])
    .filter((t) => !shortlisted.has(t.id))
    .map((t) => ({ talent: t, matches: (t.skills || []).filter((s: string) => oppSkills.includes(s.toLowerCase())) as string[] }))
    .filter((c) => oppSkills.length === 0 || c.matches.length > 0)
    .sort((a, b) => b.matches.length - a.matches.length || +new Date(b.talent.created_at) - +new Date(a.talent.created_at))
    .slice(0, 8);

  const add = (talentId: string) =>
    run(() => api("/api/applications", { method: "POST", body: { opportunity_id: opportunity.id, talent_id: talentId } }), "Added to shortlist.");

  async function search() {
    setSearchError(null);
    setResults(null);
    try {
      const res = await api<{ data: Row[] }>(`/api/talent${qs({ q: q.trim(), limit: 10 })}`);
      setResults(res.data);
    } catch (e) {
      setSearchError((e as Error).message);
    }
  }

  return (
    <div>
      <SubHeading>Shortlist</SubHeading>
      {opportunity.shortlisting_mode === "self_service" && (
        <p className="mb-2 text-xs text-slate">This employer chose to shortlist candidates themselves — you can still help if asked.</p>
      )}
      {apps.error && <p className="text-sm text-slate">{apps.error}</p>}
      {apps.data && !apps.data.data.length && <p className="text-sm text-slate">No one shortlisted yet.</p>}
      <ul className="space-y-2">
        {(apps.data?.data ?? []).map((a) => (
          <li key={a.id} className="rounded-lg border border-slate/15 bg-white p-3 text-sm">
            <p>
              <strong>{a.talent_profiles?.headline || a.talent_id}</strong> — {humanize(a.talent_profiles?.category)}{" "}
              <Badge value={a.talent_profiles?.verification_tier} />
            </p>
            {a.interview_scheduled_at && <p className="mt-1 text-xs text-slate">Interview: {fmtDateTime(a.interview_scheduled_at)}</p>}
            <ActionRow>
              <select
                aria-label="Application stage"
                className={`${inputClass} sm:w-auto`}
                value={a.stage}
                disabled={pending}
                onChange={(e) => run(() => api(`/api/applications/${a.id}`, { method: "PATCH", body: { stage: e.target.value } }), "Stage updated.")}
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </select>
              {a.stage === "accepted" && (
                <Btn
                  variant="primary"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () =>
                        api("/api/engagements", {
                          method: "POST",
                          body: {
                            opportunity_id: opportunity.id,
                            application_id: a.id,
                            talent_id: a.talent_id,
                            organisation_id: opportunity.organisation_id,
                          },
                        }),
                      "Engagement created — see Engagements."
                    )
                  }
                >
                  Create engagement
                </Btn>
              )}
            </ActionRow>
          </li>
        ))}
      </ul>
      <ActionStatus status={status} />

      <SubHeading>Suggested candidates</SubHeading>
      <p className="mb-2 text-xs text-slate">
        Ranked by skill overlap with this opportunity, then most recently joined — not by rating or tenure, so new talent surface on equal footing.
      </p>
      {!opportunity.category ? (
        <p className="text-sm text-slate">No category set on this opportunity — use the search below instead.</p>
      ) : suggested.error ? (
        <p className="text-sm text-slate">{suggested.error}</p>
      ) : !suggested.data ? (
        <p className="text-sm text-slate">Loading…</p>
      ) : !candidates.length ? (
        <p className="text-sm text-slate">No structured skill matches yet — try a search below.</p>
      ) : (
        <ul className="space-y-2">
          {candidates.map((c) => (
            <li key={c.talent.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                <strong>{c.talent.headline || c.talent.id}</strong> <Badge value={c.talent.verification_tier} />
                <span className="block text-xs text-slate">
                  {c.matches.length ? `Matches: ${c.matches.join(", ")}` : "No listed skills overlap — shown for category fit"}
                </span>
              </span>
              <Btn disabled={pending} onClick={() => add(c.talent.id)}>
                Add to shortlist
              </Btn>
            </li>
          ))}
        </ul>
      )}

      <SubHeading>Search by headline</SubHeading>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <input aria-label="Search talent by headline" className={inputClass} placeholder="Search by headline…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Btn type="submit">Search</Btn>
      </form>
      {searchError && <p className="mt-2 text-sm text-slate">{searchError}</p>}
      {results && (
        <ul className="mt-2 space-y-2">
          {!results.length && <li className="text-sm text-slate">No matches.</li>}
          {results.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {t.headline || t.id} <Badge value={t.verification_tier} />
              </span>
              {shortlisted.has(t.id) ? (
                <span className="text-xs text-slate">Already shortlisted</span>
              ) : (
                <Btn disabled={pending} onClick={() => add(t.id)}>
                  Add to shortlist
                </Btn>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
