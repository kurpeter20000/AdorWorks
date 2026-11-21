"use client";

import { useMemo, useState, useTransition } from "react";
import { setProgrammePartner } from "@/lib/actions/partnerProgrammes";

/** Staff: approve organisations as programme partners (0124). Their admins can then create cohorts and invite their team. */
export function PartnerOrgs({ orgs, canEdit }: { orgs: { id: string; name: string; verified: boolean; partner: boolean }[]; canEdit: boolean }) {
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const partners = orgs.filter((o) => o.partner);
  const matches = useMemo(
    () => (q.trim().length < 2 ? [] : orgs.filter((o) => !o.partner && o.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)),
    [q, orgs]
  );
  const toggle = (id: string, enabled: boolean) =>
    start(async () => {
      setError(null);
      const r = await setProgrammePartner(id, enabled);
      if (r.error) setError(r.error);
    });

  return (
    <div className="mt-4 rounded-lg border border-slate/15 p-4">
      <p className="text-sm font-bold text-midnight">Approved programme partners</p>
      <p className="text-xs text-slate">
        Admins of these organisations create their own cohorts and invite their team from their employer account. You still record
        facilitator background checks and mark data-sharing agreements signed.
      </p>
      {partners.length === 0 ? (
        <p className="mt-2 text-sm text-slate">None yet.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {partners.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-midnight">{o.name}</span>
              {canEdit && (
                <button type="button" disabled={pending} onClick={() => toggle(o.id, false)} className="text-xs font-semibold text-coral-ink underline">
                  Stop partnership
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="mt-3">
          <label className="text-xs font-semibold text-midnight">
            Approve an organisation
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type the organisation's name, e.g. EduPower" className="mt-1 block w-72 rounded-lg border border-slate/25 px-2 py-1.5 text-xs font-normal" />
          </label>
          {matches.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {matches.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {o.name} {!o.verified && <span className="text-xs text-coral-ink">(not verified yet)</span>}
                  </span>
                  <button type="button" disabled={pending} onClick={() => toggle(o.id, true)} className="rounded-lg bg-teal px-2.5 py-1 text-xs font-bold text-midnight disabled:opacity-60">
                    Approve as partner
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-coral-ink">{error}</p>}
    </div>
  );
}
