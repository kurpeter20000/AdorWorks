"use client";

import { useState } from "react";
import {
  ActionRow,
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
  humanize,
  inputClass,
  openStaffFile,
  qs,
  useAction,
  useStaffData,
} from "../_components/staff-ui";
import { RiskFlags } from "../_components/risk-flags";

/* eslint-disable @typescript-eslint/no-explicit-any -- staff API payloads are untyped JSON from backend/api */
type Row = any;

const FILTERS: [string, string][] = [
  ["pending", "Pending"],
  ["verified", "Verified"],
  ["rejected", "Rejected"],
  ["suspended", "Suspended"],
  ["", "All"],
];
const OVERALL = ["pending", "verified", "rejected", "suspended"];
const CHECK_STATUSES = ["not_started", "information_required", "submitted", "under_review", "verified", "rejected", "suspended", "expired"];
const CHECK_METHODS = ["formal_registration", "alternative_referral", "physical_review", "representative_attestation"];

export function OrganisationsConsole({ initialFilter }: { initialFilter: string }) {
  const [filter, setFilter] = useState(initialFilter);
  const list = useStaffData<{ data: Row[] }>(`/api/organisations${qs({ verification_status: filter, limit: 100 })}`);

  return (
    <>
      <PageHeader
        title="Organisations"
        description="The employer verification checklist (Blueprint §5.4) is followed manually off-platform; record the outcome here."
      />
      <FilterBar>
        <Chips label="Verification status" value={filter} onChange={setFilter} options={FILTERS} />
      </FilterBar>
      <StaffTable
        columns={["Name", "Sector", "Representative", "Status", "Created"]}
        rows={list.data?.data ?? null}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        rowKey={(r) => r.id}
        cells={(r) => [
          r.name,
          r.sector || "—",
          r.profiles ? `${r.profiles.full_name}${r.profiles.phone ? ` · ${r.profiles.phone}` : ""}` : "—",
          <Badge key="s" value={r.verification_status} />,
          fmtDate(r.created_at),
        ]}
        detail={(r) => <OrgDetail row={r} onChanged={list.reload} />}
        empty="No organisations match this filter."
      />
    </>
  );
}

const ORG_TYPES = ["individual", "company", "ngo", "ingo", "government", "other"];
const ORG_TYPE_LABEL: Record<string, string> = {
  individual: "Individual",
  company: "Company",
  ngo: "NGO",
  ingo: "International NGO (INGO)",
  government: "Government body",
  other: "Other",
};

function OrgDetail({ row, onChanged }: { row: Row; onChanged: () => void }) {
  const { run, pending, status, setStatus } = useAction(onChanged);
  const orgTypeAction = useAction(onChanged);
  const [overall, setOverall] = useState<string>(row.verification_status);
  const [why, setWhy] = useState<string>(row.risk_notes || "");
  const [orgType, setOrgType] = useState<string>(row.org_type || "company");

  return (
    <div onClick={(e) => e.stopPropagation()} className="space-y-6">
      <DetailLoader<{ data: Row }> path={`/api/organisations/${row.id}`}>
        {(res, reload) => (
          <Grid2>
            <div>
              <KV
                items={[
                  [
                    "Representative",
                    `${row.profiles?.full_name || "—"}${row.profiles?.phone ? ` · ${row.profiles.phone}` : ""} · ${res.data.profiles?.email || "no email on file"}`,
                  ],
                  [
                    "Website",
                    row.website ? (
                      <a href={row.website} target="_blank" rel="noopener noreferrer" className="text-teal-ink underline">
                        {row.website}
                      </a>
                    ) : (
                      "—"
                    ),
                  ],
                  ["Billing email", row.billing_email || "—"],
                  ["Organisation type", ORG_TYPE_LABEL[row.org_type] || row.org_type || "Company"],
                  [
                    "Registration evidence",
                    row.registration_evidence_path ? (
                      <Btn
                        onClick={() =>
                          openStaffFile("org-documents", row.registration_evidence_path).catch((e: Error) => setStatus({ kind: "error", message: e.message }))
                        }
                      >
                        View document
                      </Btn>
                    ) : (
                      "Not uploaded"
                    ),
                  ],
                  ["Risk notes", row.risk_notes || "—"],
                ]}
              />
              <Engagement id={row.id} />
            </div>
            <div>
              <SubHeading>Verification</SubHeading>
              {(["registration", "representative"] as const).map((type) => (
                <VerificationCheck
                  key={type}
                  orgId={row.id}
                  type={type}
                  check={(res.data.verification_checks || []).find((c: Row) => c.check_type === type)}
                  onSaved={() => {
                    reload();
                    onChanged();
                  }}
                />
              ))}
            </div>
          </Grid2>
        )}
      </DetailLoader>

      <Grid2>
        <RiskFlags targetType="organisation" targetId={row.id} />
        <div>
          <SubHeading>Overall status override</SubHeading>
          <p className="text-xs text-slate">
            Normally set automatically from the two checks — use this only to force an outcome (e.g. verification done off-platform). A reason is required
            every time, since this bypasses the normal evidence check.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <select aria-label="Overall status" className={inputClass} value={overall} onChange={(e) => setOverall(e.target.value)}>
              {OVERALL.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </select>
            <input
              aria-label="Reason for override"
              className={inputClass}
              placeholder="Why? (required, at least 10 characters)"
              value={why}
              onChange={(e) => setWhy(e.target.value)}
            />
          </div>
          <ActionRow>
            <Btn
              disabled={pending}
              onClick={() => {
                if (why.trim().length < 10) {
                  setStatus({ kind: "error", message: "Explain why (at least 10 characters) — this bypasses the normal evidence check." });
                  return;
                }
                run(() => api(`/api/organisations/${row.id}/verify`, { method: "PATCH", body: { verification_status: overall, risk_notes: why.trim() } }));
              }}
            >
              Save override
            </Btn>
          </ActionRow>
          <ActionStatus status={status} />
        </div>
      </Grid2>

      <div>
        <SubHeading>Organisation type</SubHeading>
        <p className="text-xs text-slate">
          Self-declared by the org; correct it if it&rsquo;s wrong. NGO/INGO/government types get invoice billing
          instead of mobile money.
        </p>
        <div className="mt-2 grid gap-2 sm:max-w-xs">
          <select aria-label="Organisation type" className={inputClass} value={orgType} onChange={(e) => setOrgType(e.target.value)}>
            {ORG_TYPES.map((t) => (
              <option key={t} value={t}>
                {ORG_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <ActionRow>
          <Btn
            disabled={orgTypeAction.pending}
            onClick={() => orgTypeAction.run(() => api(`/api/organisations/${row.id}/org-type`, { method: "PATCH", body: { org_type: orgType } }))}
          >
            Save type
          </Btn>
        </ActionRow>
        <ActionStatus status={orgTypeAction.status} />
      </div>
    </div>
  );
}

const CHECK_TEXT = {
  registration: {
    label: "Registration",
    hint: "Business registration documents, or an alternative verification method for SMEs/NGOs without formal registration.",
  },
  representative: { label: "Representative", hint: "Confirms the signed-up person actually represents this organisation." },
};

function VerificationCheck({
  orgId,
  type,
  check,
  onSaved,
}: {
  orgId: string;
  type: "registration" | "representative";
  check: Row | undefined;
  onSaved: () => void;
}) {
  const current = check ?? { status: "not_started", method: null, reason: null, applicant_note: null };
  const [status, setStatusValue] = useState<string>(current.status);
  const [method, setMethod] = useState<string>(current.method ?? "");
  const [reason, setReason] = useState<string>(current.reason ?? "");
  const action = useAction(onSaved);
  const text = CHECK_TEXT[type];

  return (
    <div className="mb-4 rounded-lg border border-slate/15 bg-white p-3">
      <p className="text-sm">
        <strong>{text.label}</strong> <Badge value={current.status} />
      </p>
      <p className="mt-1 text-xs text-slate">{text.hint}</p>
      {current.applicant_note && (
        <p className="mt-1 text-sm">
          <em>Organisation&rsquo;s note:</em> {current.applicant_note}
        </p>
      )}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <select aria-label={`${text.label} status`} className={inputClass} value={status} onChange={(e) => setStatusValue(e.target.value)}>
          {CHECK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </select>
        <select aria-label={`${text.label} method`} className={inputClass} value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="">— how verified —</option>
          {CHECK_METHODS.map((m) => (
            <option key={m} value={m}>
              {humanize(m)}
            </option>
          ))}
        </select>
      </div>
      <input
        aria-label={`${text.label} reason`}
        className={`${inputClass} mt-2`}
        placeholder="Reason (shown to the organisation)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <ActionRow>
        <Btn
          variant="primary"
          disabled={action.pending}
          onClick={() =>
            action.run(() =>
              api(`/api/organisations/${orgId}/verification-checks/${type}`, {
                method: "PATCH",
                body: { status, method: method || undefined, reason: reason || undefined },
              })
            )
          }
        >
          Save {text.label.toLowerCase()}
        </Btn>
      </ActionRow>
      <ActionStatus status={action.status} />
    </div>
  );
}

function breakdown(byStatus: Record<string, number>) {
  const parts = Object.entries(byStatus).map(([k, v]) => `${humanize(k)}: ${v}`);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

function Engagement({ id }: { id: string }) {
  const { data, error } = useStaffData<{ data: Row }>(`/api/organisations/${id}/engagement`);
  return (
    <div className="mt-5">
      <SubHeading>Engagement</SubHeading>
      {error && <p className="text-sm text-slate">{error}</p>}
      {!data && !error && <p className="text-sm text-slate">Loading…</p>}
      {data && (
        <KV
          items={[
            ["Opportunities", `${data.data.opportunities.total} posted${breakdown(data.data.opportunities.by_status)}`],
            ["Applications received", String(data.data.applications_total)],
            ["Offers", `${data.data.offers.total} sent${breakdown(data.data.offers.by_status)}`],
            ["Contracts", `${data.data.contracts.total} total${breakdown(data.data.contracts.by_status)}`],
            ["Last activity", fmtDate(data.data.last_activity_at)],
          ]}
        />
      )}
    </div>
  );
}
