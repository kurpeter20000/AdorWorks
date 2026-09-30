"use client";

import { useState } from "react";
import {
  Badge,
  Btn,
  Chips,
  Field,
  FilterBar,
  KV,
  Notice,
  PageHeader,
  Section,
  StaffTable,
  api,
  fmtDateTime,
  inputClass,
  qs,
  useStaffData,
} from "../_components/staff-ui";

/* eslint-disable @typescript-eslint/no-explicit-any -- staff API payloads are untyped JSON from backend/api */
type Row = any;
type Result = { kind: "success" | "error"; message: string; secret?: string } | null;

// Kept in sync with ASSISTED_TALENT_FIELDS in backend/api/src/routes/
// assistedOnboarding.js — the server re-validates this list regardless.
const ASSISTED_FIELDS: [string, string][] = [
  ["legal_name", "Legal name"],
  ["display_name", "Display name"],
  ["headline", "Headline"],
  ["bio", "Bio"],
  ["location", "Location"],
  ["category", "Category"],
  ["skills", "Skills"],
  ["languages", "Languages"],
  ["availability", "Availability"],
];
const FILTERS: [string, string][] = [
  ["pending", "Pending"],
  ["assigned", "Assigned"],
  ["closed", "Closed"],
  ["", "All"],
];

const agentName = (a: Row) => (a.profiles ? a.profiles.full_name || a.profiles.phone || a.id : a.id);

function ResultNotice({ result }: { result: Result }) {
  if (!result) return null;
  return (
    <div className="mt-3">
      <Notice tone={result.kind === "error" ? "error" : "success"}>
        {result.message}
        {result.secret && (
          <span className="mt-1 block">
            Temporary password (shown once — give it to them directly): <code className="rounded bg-white px-1.5 py-0.5 font-bold">{result.secret}</code>
          </span>
        )}
      </Notice>
    </div>
  );
}

export function AssistedOnboardingConsole({ isAdmin }: { isAdmin: boolean }) {
  const [filter, setFilter] = useState("pending");
  const requests = useStaffData<{ data: Row[] }>(`/api/assisted-onboarding/assistance-requests${qs({ status: filter, limit: 100 })}`);
  const agents = useStaffData<{ data: Row[] }>("/api/assisted-onboarding/onboarding-agents");
  const hubs = useStaffData<{ data: Row[] }>("/api/assisted-onboarding/partner-hubs");
  const activeAgents = (agents.data?.data ?? []).filter((a) => a.status === "active");

  return (
    <>
      <PageHeader
        title="Assisted onboarding"
        description="Partner hubs (cybercafés, NGO offices, schools), the onboarding agents who work from them, and requests from people who need in-person help finishing their profile. Only admins can add hubs and agents; any staff can start a session for a request."
      />

      <Section title="Assistance requests">
        <FilterBar>
          <Chips label="Status" value={filter} onChange={setFilter} options={FILTERS} />
        </FilterBar>
        <StaffTable
          columns={["Requested by", "Reason", "Status", "Requested"]}
          rows={requests.data?.data ?? null}
          loading={requests.loading}
          error={requests.error}
          onRetry={requests.reload}
          rowKey={(r) => r.id}
          cells={(r) => [
            r.profiles ? r.profiles.full_name || r.profiles.phone || "Account holder" : "No account yet",
            r.reason || "—",
            <Badge key="s" value={r.status} />,
            fmtDateTime(r.created_at),
          ]}
          detail={(r) => <StartSession request={r} agents={activeAgents} onStarted={requests.reload} />}
          empty="No requests match this filter."
        />
      </Section>

      <Section title="Onboarding agents">
        <StaffTable
          columns={["Name", "Partner hub", "Status"]}
          rows={agents.data?.data ?? null}
          loading={agents.loading}
          error={agents.error}
          onRetry={agents.reload}
          rowKey={(a) => a.id}
          cells={(a) => [agentName(a), a.partner_hubs?.name || "—", <Badge key="s" value={a.status} />]}
          empty="No onboarding agents yet."
        />
        {isAdmin && <AddAgent hubs={hubs.data?.data ?? []} onAdded={agents.reload} />}
      </Section>

      <Section title="Partner hubs">
        <StaffTable
          columns={["Name", "Location", "Contact"]}
          rows={hubs.data?.data ?? null}
          loading={hubs.loading}
          error={hubs.error}
          onRetry={hubs.reload}
          rowKey={(h) => h.id}
          cells={(h) => [h.name, h.location || "—", [h.contact_email, h.contact_phone].filter(Boolean).join(" · ") || "—"]}
          empty="No partner hubs yet."
        />
        {isAdmin && <AddHub onAdded={hubs.reload} />}
      </Section>
    </>
  );
}

function StartSession({ request, agents, onStarted }: { request: Row; agents: Row[]; onStarted: () => void }) {
  const [agentId, setAgentId] = useState<string>(agents[0]?.id ?? "");
  const [minutes, setMinutes] = useState("60");
  const [fields, setFields] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const needsAccount = !request.requested_by;

  const details = (
    <KV
      items={[
        ["Reason", request.reason || "—"],
        ["Preferred contact", request.preferred_channel || "—"],
      ]}
    />
  );

  if (request.status !== "pending") {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        {details}
        <p className="mt-3 text-sm text-slate">This request is already {request.status}.</p>
      </div>
    );
  }
  if (!agents.length) {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        {details}
        <p className="mt-3 text-sm text-slate">Add an active onboarding agent before starting a session.</p>
      </div>
    );
  }

  async function start() {
    if (!fields.length) return setResult({ kind: "error", message: "Choose at least one field the agent can help with." });
    const body: Record<string, unknown> = { agent_id: agentId, fields, expires_in_minutes: Number(minutes) || 60 };
    if (needsAccount) {
      if (!email.trim()) return setResult({ kind: "error", message: "Enter their email address — an account needs to be created for them." });
      body.email = email.trim();
      if (fullName.trim()) body.full_name = fullName.trim();
    }
    setPending(true);
    setResult(null);
    try {
      const res = await api<Row>(`/api/assisted-onboarding/assistance-requests/${request.id}/start-session`, { method: "POST", body });
      setResult(
        res.temporary_password
          ? { kind: "success", message: "Session started. Account created.", secret: res.temporary_password }
          : { kind: "success", message: "Session started — the person will see a consent prompt next time they sign in." }
      );
      onStarted();
    } catch (err) {
      setResult({ kind: "error", message: (err as Error).message });
    } finally {
      setPending(false);
    }
  }

  return (
    <div onClick={(e) => e.stopPropagation()} className="space-y-3">
      {details}
      {needsAccount && (
        <>
          <p className="text-xs text-slate">No account is linked yet — collect an email address and one will be created with a temporary password for you to pass on.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input type="email" aria-label="Their email address" className={inputClass} placeholder="Their email address" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input aria-label="Full name" className={inputClass} placeholder="Full name (optional)" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
        </>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Agent">
          <select className={inputClass} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {agentName(a)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Minutes until the session expires">
          <input type="number" min={5} max={240} className={inputClass} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-semibold text-midnight">Fields the agent may help with</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {ASSISTED_FIELDS.map(([value, label]) => (
            <label key={value} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={fields.includes(value)}
                onChange={(e) => setFields((prev) => (e.target.checked ? [...prev, value] : prev.filter((f) => f !== value)))}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <Btn variant="primary" disabled={pending} onClick={start}>
        Start session
      </Btn>
      <ResultNotice result={result} />
    </div>
  );
}

function AddAgent({ hubs, onAdded }: { hubs: Row[]; onAdded: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [hubId, setHubId] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const hub = hubId || hubs[0]?.id || "";

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !hub) return setResult({ kind: "error", message: "Enter the agent's email and choose a partner hub." });
    setPending(true);
    setResult(null);
    try {
      const res = await api<Row>("/api/assisted-onboarding/onboarding-agents", {
        method: "POST",
        body: { email: email.trim(), full_name: name.trim() || undefined, partner_hub_id: hub },
      });
      setResult(
        res.temporary_password
          ? { kind: "success", message: "Agent added.", secret: res.temporary_password }
          : { kind: "success", message: "Added — this account already existed, so their existing password still works." }
      );
      setEmail("");
      setName("");
      onAdded();
    } catch (err) {
      setResult({ kind: "error", message: (err as Error).message });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={add} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
      <input type="email" aria-label="Agent's email" className={inputClass} placeholder="Agent's email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input aria-label="Agent's full name" className={inputClass} placeholder="Full name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
      <select aria-label="Partner hub" className={inputClass} value={hub} onChange={(e) => setHubId(e.target.value)}>
        {hubs.length ? (
          hubs.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))
        ) : (
          <option value="">Add a partner hub first</option>
        )}
      </select>
      <Btn type="submit" variant="primary" disabled={pending}>
        Add agent
      </Btn>
      <div className="sm:col-span-4">
        <ResultNotice result={result} />
      </div>
    </form>
  );
}

function AddHub({ onAdded }: { onAdded: () => void }) {
  const [v, setV] = useState({ name: "", location: "", contact_email: "", contact_phone: "" });
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) return setResult({ kind: "error", message: "Enter a hub name." });
    setPending(true);
    setResult(null);
    try {
      await api("/api/assisted-onboarding/partner-hubs", {
        method: "POST",
        body: {
          name: v.name.trim(),
          location: v.location.trim() || undefined,
          contact_email: v.contact_email.trim() || undefined,
          contact_phone: v.contact_phone.trim() || undefined,
        },
      });
      setV({ name: "", location: "", contact_email: "", contact_phone: "" });
      setResult({ kind: "success", message: "Partner hub added." });
      onAdded();
    } catch (err) {
      setResult({ kind: "error", message: (err as Error).message });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={add} className="mt-3 grid gap-2 sm:grid-cols-2">
      <input aria-label="Hub name" className={inputClass} placeholder="Hub name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      <input aria-label="Location" className={inputClass} placeholder="Location" value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} />
      <input
        type="email"
        aria-label="Contact email"
        className={inputClass}
        placeholder="Contact email (optional)"
        value={v.contact_email}
        onChange={(e) => setV({ ...v, contact_email: e.target.value })}
      />
      <input aria-label="Contact phone" className={inputClass} placeholder="Contact phone (optional)" value={v.contact_phone} onChange={(e) => setV({ ...v, contact_phone: e.target.value })} />
      <div className="sm:col-span-2">
        <Btn type="submit" variant="primary" disabled={pending}>
          Add partner hub
        </Btn>
        <ResultNotice result={result} />
      </div>
    </form>
  );
}
