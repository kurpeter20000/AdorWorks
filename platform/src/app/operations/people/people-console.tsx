"use client";

import { useEffect, useState } from "react";
import {
  ActionStatus,
  Badge,
  Btn,
  Field,
  FilterBar,
  Notice,
  PageHeader,
  Section,
  StaffTable,
  api,
  fmtDate,
  fmtDateTime,
  humanize,
  inputClass,
  qs,
  useAction,
  useStaffData,
} from "../_components/staff-ui";

/* eslint-disable @typescript-eslint/no-explicit-any -- staff API payloads are untyped JSON from backend/api */
type Row = any;

const ROLES = ["talent", "individual_client", "employer", "org_admin", "org_member", "reviewer", "matcher", "finance", "admin", "onboarding_agent", "partner_hub_admin"];
const ROLE_FILTER: [string, string][] = [
  ["talent", "Talent"],
  ["individual_client", "Individual client"],
  ["employer", "Employer (assisted intake)"],
  ["org_admin", "Company admin"],
  ["org_member", "Company team member"],
  ["reviewer", "Staff — reviewer"],
  ["matcher", "Staff — matcher"],
  ["finance", "Staff — finance"],
  ["admin", "Staff — admin"],
  ["onboarding_agent", "Onboarding agent"],
  ["partner_hub_admin", "Partner hub admin"],
];
const STAFF_ROLE_OPTIONS = ["reviewer", "matcher", "finance", "admin"];

export function PeopleConsole() {
  const [role, setRole] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const people = useStaffData<{ data: Row[] }>(`/api/people${qs({ limit: 100, role, q })}`);
  const requests = useStaffData<{ data: Row[] }>("/api/people/role-requests");
  const audit = useStaffData<{ data: Row[] }>("/api/people/audit-events?limit=50");
  const refreshAll = () => {
    people.reload();
    requests.reload();
    audit.reload();
  };
  const page = useAction(refreshAll);

  return (
    <>
      <PageHeader
        title="People"
        description="Search every account by role — talent, clients, company reps, or staff — change roles, suspend or reinstate, and add staff. Admin-only."
      />

      <AddStaff onAdded={refreshAll} />

      {requests.data && requests.data.data.length > 0 && (
        <Section title="Pending role approvals">
          <p className="mb-2 text-xs text-slate">Promoting to admin or finance needs a second admin&rsquo;s approval — you can&rsquo;t approve your own request.</p>
          <StaffTable
            columns={["Requested", "Account", "Role", "Requested by", "Decision"]}
            rows={requests.data.data}
            rowKey={(r) => r.id}
            cells={(r) => [
              fmtDateTime(r.created_at),
              r.target_name,
              <Badge key="r" value={r.requested_role} />,
              r.requested_by_name,
              <span key="d" className="flex flex-wrap gap-2">
                <Btn
                  variant="primary"
                  disabled={page.pending}
                  onClick={() => page.run(() => api(`/api/people/role-requests/${r.id}/approve`, { method: "POST", body: {} }), "Approved — role updated.")}
                >
                  Approve
                </Btn>
                <Btn disabled={page.pending} onClick={() => page.run(() => api(`/api/people/role-requests/${r.id}/reject`, { method: "POST", body: {} }), "Rejected.")}>
                  Reject
                </Btn>
              </span>,
            ]}
            empty="None."
          />
        </Section>
      )}
      {requests.error && (
        <div className="mt-4">
          <Notice tone="error">{requests.error}</Notice>
        </div>
      )}

      <Section title="Accounts">
        <FilterBar>
          <select aria-label="Role" className={`${inputClass} sm:w-auto`} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            {ROLE_FILTER.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <input aria-label="Search by name" className={`${inputClass} sm:w-64`} placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </FilterBar>
        <ActionStatus status={page.status} />
        <div className="mt-3">
          <StaffTable
            columns={["Name", "Email", "Role", "Status", "Created", "Policy consent"]}
            rows={people.data?.data ?? null}
            loading={people.loading}
            error={people.error}
            onRetry={people.reload}
            rowKey={(r) => r.id}
            cells={(r) => [
              r.full_name || "—",
              r.email || "—",
              <Badge key="r" value={r.role} />,
              <Badge key="s" value={r.status} />,
              fmtDate(r.created_at),
              r.policy_consent_at ? (
                <span key="p">
                  v{r.policy_version || "?"} · {fmtDate(r.policy_consent_at)}
                  <span className="block text-xs text-slate">{humanize(r.policy_consent_source)}</span>
                </span>
              ) : (
                <span key="p" className="text-slate">
                  Not recorded
                </span>
              ),
            ]}
            detail={(r) => <PersonActions row={r} onChanged={refreshAll} />}
            empty="No accounts match this filter."
          />
        </div>
      </Section>

      <Section title="Recent audit events">
        <p className="mb-2 text-xs text-slate">Who changed what, and when — staff and role assignments, suspensions and more.</p>
        <StaffTable
          columns={["When", "Event", "Actor", "Subject", "Before → After"]}
          rows={audit.data?.data ?? null}
          loading={audit.loading}
          error={audit.error}
          onRetry={audit.reload}
          rowKey={(e) => e.id ?? `${e.occurred_at}-${e.name}`}
          cells={(e) => [
            fmtDateTime(e.occurred_at),
            e.name,
            e.actor_name || e.actor_id || "—",
            e.subject_name || e.subject_id || "—",
            `${e.before?.role ?? "—"} → ${e.after?.role ?? "—"}`,
          ]}
          empty="No audited events yet."
        />
      </Section>
    </>
  );
}

function AddStaff({ onAdded }: { onAdded: () => void }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("reviewer");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ kind: "success" | "error"; message: string; password?: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setResult(null);
    try {
      const res = await api<Row>("/api/people/staff", { method: "POST", body: { email: email.trim(), fullName: fullName.trim() || undefined, role } });
      const who = res.data?.full_name || res.data?.email || email;
      const message = res.pendingApproval
        ? res.message
        : res.temporaryPassword
          ? `Added ${who} as ${role}.`
          : `Promoted ${who} to ${role}.`;
      setResult({ kind: "success", message, password: res.temporaryPassword });
      setEmail("");
      setFullName("");
      onAdded();
    } catch (err) {
      setResult({ kind: "error", message: (err as Error).message });
    } finally {
      setPending(false);
    }
  }

  return (
    <Section title="Add staff">
      <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate/15 bg-white p-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
        <Field label="Email">
          <input required type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Full name (optional)">
          <input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Role">
          <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value)}>
            {STAFF_ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {humanize(r)}
              </option>
            ))}
          </select>
        </Field>
        <Btn type="submit" variant="primary" disabled={pending}>
          {pending ? "Adding…" : "Add staff"}
        </Btn>
      </form>
      {result && (
        <div className="mt-3">
          <Notice tone={result.kind === "error" ? "error" : "success"}>
            {result.message}
            {result.password && (
              <span className="mt-1 block">
                One-time password (shown once — give it to them directly): <code className="rounded bg-white px-1.5 py-0.5 font-bold">{result.password}</code>
              </span>
            )}
          </Notice>
        </div>
      )}
    </Section>
  );
}

function PersonActions({ row, onChanged }: { row: Row; onChanged: () => void }) {
  const { run, pending, status, setStatus } = useAction(onChanged);
  const [role, setRole] = useState<string>(row.role);
  const [reason, setReason] = useState("");
  const who = row.full_name || row.email || row.id;

  return (
    <div onClick={(e) => e.stopPropagation()} className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field label="Role">
          <select className={`${inputClass} sm:w-56`} value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {humanize(r)}
              </option>
            ))}
          </select>
        </Field>
        <Btn
          variant="primary"
          disabled={pending || role === row.role}
          onClick={() =>
            run(async () => {
              const res = await api<Row>(`/api/people/${row.id}/role`, { method: "PATCH", body: { role } });
              if (res.pendingApproval) setTimeout(() => setStatus({ kind: "success", message: res.message }), 0);
            }, `Updated ${who} to ${humanize(role)}.`)
          }
        >
          Save role
        </Btn>
        <Btn
          disabled={pending}
          title="Ends this account's active sessions within an hour, e.g. if it may be compromised"
          onClick={() => {
            if (!window.confirm(`End ${who}'s active sessions? They'll need to sign in again within about an hour.`)) return;
            run(() => api(`/api/people/${row.id}/force-reauth`, { method: "POST", body: {} }), "Sessions will end within the hour.");
          }}
        >
          Force re-auth
        </Btn>
      </div>

      {(row.status === "active" || row.status === "suspended") && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            aria-label="Reason"
            className={inputClass}
            placeholder={row.status === "active" ? "Why suspend? (at least 10 characters — they're signed out within the hour)" : "Why reinstate? (at least 10 characters)"}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {row.status === "active" ? (
            <Btn
              variant="danger"
              disabled={pending || reason.trim().length < 10}
              onClick={() => run(() => api(`/api/people/${row.id}/suspend`, { method: "POST", body: { reason: reason.trim() } }), `Suspended ${who}.`)}
            >
              Suspend
            </Btn>
          ) : (
            <Btn
              disabled={pending || reason.trim().length < 10}
              onClick={() => run(() => api(`/api/people/${row.id}/reinstate`, { method: "POST", body: { reason: reason.trim() } }), `Reinstated ${who}.`)}
            >
              Reinstate
            </Btn>
          )}
        </div>
      )}
      <ActionStatus status={status} />
    </div>
  );
}
