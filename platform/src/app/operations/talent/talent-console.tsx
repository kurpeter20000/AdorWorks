"use client";

import { useState } from "react";
import {
  ActionRow,
  ActionStatus,
  Badge,
  Btn,
  DetailLoader,
  FilterBar,
  Grid2,
  KV,
  PageHeader,
  ReasonAction,
  Section,
  Select,
  StaffTable,
  SubHeading,
  Timeline,
  api,
  fmtDateTime,
  humanize,
  inputClass,
  openStaffFile,
  qs,
  useAction,
  useStaffData,
} from "../_components/staff-ui";

const CATEGORIES: [string, string][] = [
  ["creative_media", "Creative & media"],
  ["digital_technology", "Digital & technology"],
  ["business_project_support", "Business & project support"],
];
const TIERS = ["registered", "identity_verified", "adorverified", "adorcertified", "team_lead"];

/* eslint-disable @typescript-eslint/no-explicit-any -- staff API payloads are untyped JSON from backend/api */
type Row = any;

export function TalentConsole() {
  const [category, setCategory] = useState("");
  const [tier, setTier] = useState("");
  const list = useStaffData<{ data: Row[] }>(`/api/talent${qs({ limit: 100, category, tier })}`);
  const videos = useStaffData<{ data: Row[] }>("/api/talent/pending-videos");

  const refreshAll = () => {
    list.reload();
    videos.reload();
  };

  return (
    <>
      <PageHeader
        title="Talent"
        description="Review evidence, set verification tiers, and decide who's ready to be publicly visible in employer talent search."
      />

      {videos.data && videos.data.data.length > 0 && (
        <Section title={`Introduction videos pending review (${videos.data.data.length})`}>
          <StaffTable
            columns={["Headline", "Category", "Submitted"]}
            rows={videos.data.data}
            rowKey={(v) => `video-${v.talent_id}`}
            cells={(v) => [v.talent_profiles?.headline || v.talent_id, humanize(v.talent_profiles?.category), fmtDateTime(v.created_at)]}
            detail={(v) => <TalentDetail id={v.talent_id} onChanged={refreshAll} />}
            empty="Nothing waiting."
          />
        </Section>
      )}

      <Section title="All talent">
        <FilterBar>
          <Select label="Category" value={category} onChange={setCategory} options={CATEGORIES} placeholder="All categories" />
          <Select label="Tier" value={tier} onChange={setTier} options={TIERS} placeholder="All tiers" />
        </FilterBar>
        <StaffTable
          columns={["Headline", "Category", "Tier", "Location", "Visibility"]}
          rows={list.data?.data ?? null}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          rowKey={(r) => r.id}
          cells={(r) => [
            r.headline || r.profiles?.full_name || "—",
            humanize(r.category),
            <Badge key="t" value={r.verification_tier} />,
            r.location || "—",
            r.public_visible ? <Badge key="v" value="Public" tone="success" /> : <Badge key="v" value="Hidden" tone="neutral" />,
          ]}
          detail={(r) => <TalentDetail id={r.id} onChanged={refreshAll} />}
          empty="No talent profiles match this filter."
        />
      </Section>
    </>
  );
}

function TalentDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  return (
    <DetailLoader<{ data: Row }> path={`/api/talent/${id}`}>
      {(res, reload) => <TalentDetailBody id={id} d={res.data} reload={reload} onChanged={onChanged} />}
    </DetailLoader>
  );
}

function TalentDetailBody({ id, d, reload, onChanged }: { id: string; d: Row; reload: () => void; onChanged: () => void }) {
  const p = d.profile;
  const [newTier, setNewTier] = useState<string>(p.verification_tier);
  const [notes, setNotes] = useState("");
  const { run, pending, status, setStatus } = useAction(() => {
    reload();
    onChanged();
  });
  const v = d.introduction_video;

  const open = (bucket: string, path: string) => openStaffFile(bucket, path).catch((e: Error) => setStatus({ kind: "error", message: e.message }));

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Grid2>
        <div>
          <KV
            items={[
              ["Contact", p.profiles ? `${p.profiles.full_name} · ${p.profiles.phone || "no phone on file"}` : "—"],
              ["Bio", p.bio || "—"],
              ["Skills", (p.skills || []).join(", ") || "—"],
              ["Languages", (p.languages || []).join(", ") || "—"],
              ["Work mode / availability", `${humanize(p.work_mode)} · ${humanize(p.availability)}`],
              ["Rate", `${p.rate_min || "—"}–${p.rate_max || "—"} ${p.currency || ""}`],
              [
                "Portfolio",
                p.portfolio_url ? (
                  <a href={p.portfolio_url} target="_blank" rel="noopener noreferrer" className="text-teal-ink underline">
                    {p.portfolio_url}
                  </a>
                ) : (
                  "—"
                ),
              ],
            ]}
          />
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(p.public_visible)}
              disabled={pending}
              onChange={(e) => run(() => api(`/api/talent/${id}`, { method: "PATCH", body: { public_visible: e.target.checked } }))}
            />
            Publicly visible in employer talent search
          </label>
        </div>

        <div>
          <SubHeading>Verification</SubHeading>
          <div className="grid gap-2 sm:grid-cols-2">
            <select aria-label="New tier" className={inputClass} value={newTier} onChange={(e) => setNewTier(e.target.value)}>
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {humanize(t)}
                </option>
              ))}
            </select>
            <input aria-label="Tier notes" className={inputClass} placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <ActionRow>
            <Btn
              variant="primary"
              disabled={pending}
              onClick={() => run(() => api(`/api/talent/${id}/verify`, { method: "POST", body: { new_tier: newTier, notes: notes || undefined } }))}
            >
              Update tier
            </Btn>
          </ActionRow>

          <SubHeading>Introduction video</SubHeading>
          {!v ? (
            <p className="text-sm text-slate">No introduction video submitted.</p>
          ) : (
            <>
              <p className="text-sm">
                <Badge value={v.status} />
                {v.status === "rejected" && v.rejection_reason ? ` — ${v.rejection_reason}` : ""}
              </p>
              {v.transcript && <p className="mt-1 text-xs text-slate">Transcript: {v.transcript}</p>}
              <ActionRow>
                <Btn onClick={() => open("talent-videos", v.video_path)}>View video</Btn>
                {v.status === "pending" && (
                  <Btn
                    variant="primary"
                    disabled={pending}
                    onClick={() => run(() => api(`/api/talent/${id}/introduction-video/review`, { method: "POST", body: { status: "approved" } }))}
                  >
                    Approve
                  </Btn>
                )}
              </ActionRow>
              {v.status === "pending" && (
                <div className="mt-2">
                  <ReasonAction
                    label="Reject"
                    placeholder="Reason for rejecting (required)"
                    disabled={pending}
                    onSubmit={(reason) =>
                      run(() =>
                        api(`/api/talent/${id}/introduction-video/review`, { method: "POST", body: { status: "rejected", rejection_reason: reason } })
                      )
                    }
                  />
                </div>
              )}
            </>
          )}

          <SubHeading>Evidence</SubHeading>
          {d.evidence.length === 0 ? (
            <p className="text-sm text-slate">No evidence submitted yet.</p>
          ) : (
            <ul className="space-y-3">
              {d.evidence.map((e: Row) => (
                <li key={e.id} className="rounded-lg border border-slate/15 bg-white p-3 text-sm">
                  <p>
                    <strong>{e.evidence_type}</strong> <Badge value={e.status} />
                  </p>
                  {e.notes && <p className="mt-1 text-slate">{e.notes}</p>}
                  {e.status === "rejected" && e.rejection_reason && <p className="mt-1 text-slate italic">{e.rejection_reason}</p>}
                  <ActionRow>
                    {e.file_path && <Btn onClick={() => open("talent-evidence", e.file_path)}>View document</Btn>}
                    {e.status === "pending" && (
                      <Btn
                        variant="primary"
                        disabled={pending}
                        onClick={() => run(() => api(`/api/talent/${id}/evidence/${e.id}/review`, { method: "POST", body: { status: "approved" } }))}
                      >
                        Approve
                      </Btn>
                    )}
                  </ActionRow>
                  {e.status === "pending" && (
                    <div className="mt-2">
                      <ReasonAction
                        label="Reject"
                        placeholder="Reason for rejecting (required)"
                        disabled={pending}
                        onSubmit={(reason) =>
                          run(() =>
                            api(`/api/talent/${id}/evidence/${e.id}/review`, { method: "POST", body: { status: "rejected", rejection_reason: reason } })
                          )
                        }
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <SubHeading>Tier history</SubHeading>
          <Timeline
            empty="No tier changes yet."
            items={d.verification_history.map((h: Row, i: number) => ({
              key: `${h.created_at}-${i}`,
              when: h.created_at,
              body: `${humanize(h.old_tier) === "—" ? "(new)" : humanize(h.old_tier)} → ${humanize(h.new_tier)}${h.notes ? ` — ${h.notes}` : ""}`,
            }))}
          />
        </div>
      </Grid2>
      <ActionStatus status={status} />
    </div>
  );
}
