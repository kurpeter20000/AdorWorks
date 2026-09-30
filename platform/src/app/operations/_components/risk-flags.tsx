"use client";

import { useState } from "react";
import { ActionRow, Badge, Btn, Field, SubHeading, api, fmtDate, inputClass, qs, useAction, useStaffData, ActionStatus } from "./staff-ui";

const INDICATORS: [string, string][] = [
  ["fraud", "Fraud"],
  ["scam", "Scam"],
  ["fake_identity", "Fake identity"],
  ["payment_risk", "Payment risk"],
  ["other", "Other"],
];
const LABEL = Object.fromEntries(INDICATORS);

/* eslint-disable @typescript-eslint/no-explicit-any -- staff API payloads are untyped JSON */

/**
 * S10-11 proactive fraud/scam indicators on an organisation or talent —
 * separate from the reactive, user-submitted Reports queue.
 */
export function RiskFlags({ targetType, targetId }: { targetType: "organisation" | "talent"; targetId: string }) {
  const { data, error, reload } = useStaffData<{ data: any[] }>(
    `/api/risk-flags${qs({ target_type: targetType, target_id: targetId, limit: 20 })}`
  );
  const { run, pending, status } = useAction(reload);
  const [adding, setAdding] = useState(false);
  const [indicator, setIndicator] = useState("fraud");
  const [note, setNote] = useState("");
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");

  const flags = data?.data ?? [];
  const openCount = flags.filter((f) => !f.resolved).length;

  return (
    <div>
      <SubHeading>Risk flags{openCount ? ` (${openCount} open)` : ""}</SubHeading>
      {error && <p className="text-sm text-slate">{error}</p>}
      {data && !flags.length && <p className="text-sm text-slate">No flags on this {targetType}.</p>}
      <ul className="space-y-2">
        {flags.map((f) => (
          <li key={f.id} className="text-sm">
            <Badge value={f.resolved ? "resolved" : "open"} tone={f.resolved ? "neutral" : "danger"} /> {LABEL[f.indicator] ?? f.indicator} — {f.note}{" "}
            <em className="text-slate">
              ({f.flagger?.full_name || "staff"}, {fmtDate(f.created_at)})
            </em>
            {!f.resolved &&
              (resolving === f.id ? (
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    className={inputClass}
                    placeholder="What did you find, and what did you do?"
                    aria-label="Resolution notes"
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                  />
                  <Btn
                    variant="primary"
                    disabled={pending || !resolution.trim()}
                    onClick={async () => {
                      const ok = await run(() =>
                        api(`/api/risk-flags/${f.id}/resolve`, { method: "POST", body: { resolution_notes: resolution.trim() } })
                      );
                      if (ok) {
                        setResolving(null);
                        setResolution("");
                      }
                    }}
                  >
                    Resolve
                  </Btn>
                </div>
              ) : (
                <Btn className="ml-2" onClick={() => setResolving(f.id)}>
                  Resolve…
                </Btn>
              ))}
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="mt-3 grid gap-2 rounded-lg border border-slate/15 bg-white p-3">
          <Field label="Indicator">
            <select className={inputClass} value={indicator} onChange={(e) => setIndicator(e.target.value)}>
              {INDICATORS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="What's suspicious, and why?">
            <textarea className={inputClass} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <ActionRow>
            <Btn
              variant="danger"
              disabled={pending || !note.trim()}
              onClick={async () => {
                const ok = await run(() =>
                  api("/api/risk-flags", { method: "POST", body: { target_type: targetType, target_id: targetId, indicator, note: note.trim() } })
                );
                if (ok) {
                  setAdding(false);
                  setNote("");
                }
              }}
            >
              Save flag
            </Btn>
            <Btn onClick={() => setAdding(false)}>Cancel</Btn>
          </ActionRow>
        </div>
      ) : (
        <ActionRow>
          <Btn variant="danger" onClick={() => setAdding(true)}>
            Flag as suspicious
          </Btn>
        </ActionRow>
      )}
      <ActionStatus status={status} />
    </div>
  );
}
