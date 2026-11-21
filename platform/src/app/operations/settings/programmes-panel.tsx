"use client";

import { useActionState, useState, useTransition } from "react";
import { addPartnerUser, addProgrammeMember, createProgramme, markAgreementSigned, recordGuardianConsent } from "@/lib/actions/programmeConsent";
import { PROGRAMME_TYPES, type ProgrammeType } from "@/lib/domain/pathways";
import { addFacilitator, recordBackgroundCheck } from "@/lib/actions/pathwaysSessions";
import { formatDate } from "@/lib/domain/format";

export interface ProgrammeView {
  id: string;
  name: string;
  partnerName: string;
  agreementSignedAt: string | null;
  endsOn: string | null;
  programmeType: string | null;
  joinCode: string | null;
  partnerUsers: string[];
  facilitators: { userId: string; name: string; checkedAt: string | null; note: string | null }[];
  members: {
    talentId: string;
    name: string;
    isMinor: boolean;
    consent: { named: boolean; earnings: boolean; story: boolean; at: string; version: string; guardian: string | null } | null;
  }[];
}

const input = "w-full rounded-lg border border-slate/25 px-3 py-2 text-sm focus:border-teal focus:outline-none";

/** Staff: programmes, members and the consent log (0120). */
export function ProgrammesPanel({ programmes, canEdit }: { programmes: ProgrammeView[]; canEdit: boolean }) {
  return (
    <div className="mt-4 space-y-4">
      {programmes.length === 0 && <p className="text-sm text-slate">No programmes yet. Add one when a partner signs up.</p>}
      {programmes.map((p) => (
        <ProgrammeCard key={p.id} p={p} canEdit={canEdit} />
      ))}
      {canEdit && <NewProgrammeForm />}
    </div>
  );
}

function NewProgrammeForm() {
  const [state, action, pending] = useActionState(createProgramme, {});
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-bold text-teal-ink underline">
        + Add a programme
      </button>
    );
  }
  return (
    <form action={action} className="grid gap-3 rounded-lg border border-slate/15 p-4 sm:grid-cols-3">
      <label className="text-sm">
        <span className="mb-1 block font-semibold text-midnight">Cohort name</span>
        <input name="name" required className={input} placeholder="e.g. EduPower Career Readiness — Juba, Jan 2027" />
        {state.errors?.name && <span className="mt-1 block text-xs text-coral-ink">{state.errors.name[0]}</span>}
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-semibold text-midnight">Partner</span>
        <input name="partnerName" required className={input} defaultValue="EduPower Youth Foundation" />
        {state.errors?.partnerName && <span className="mt-1 block text-xs text-coral-ink">{state.errors.partnerName[0]}</span>}
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-semibold text-midnight">Programme</span>
        <select name="programmeType" className={input} defaultValue="career_readiness">
          {(Object.keys(PROGRAMME_TYPES) as ProgrammeType[]).map((k) => (
            <option key={k} value={k}>
              {PROGRAMME_TYPES[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-semibold text-midnight">Funder (optional)</span>
        <input name="funder" className={input} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-semibold text-midnight">Region (optional)</span>
        <input name="region" className={input} placeholder="e.g. Juba" />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-semibold text-midnight">Placement target (optional)</span>
        <input name="targetPlaced" inputMode="numeric" className={input} placeholder="e.g. 20" />
        {state.errors?.targetPlaced && <span className="mt-1 block text-xs text-coral-ink">{state.errors.targetPlaced[0]}</span>}
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-semibold text-midnight">Starts on</span>
        <input name="startsOn" type="date" className={input} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-semibold text-midnight">Ends on</span>
        <input name="endsOn" type="date" className={input} />
      </label>
      {state.message && <p className="text-sm text-coral-ink sm:col-span-3">{state.message}</p>}
      {"saved" in state && state.saved && <p className="text-sm text-teal-ink sm:col-span-3">Programme added.</p>}
      <button type="submit" disabled={pending} className="rounded-lg bg-teal px-4 py-2 text-sm font-bold text-midnight disabled:opacity-60 sm:col-span-3 sm:justify-self-start">
        {pending ? "Saving…" : "Add programme"}
      </button>
    </form>
  );
}

function ProgrammeCard({ p, canEdit }: { p: ProgrammeView; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [state, action, adding] = useActionState(addProgrammeMember.bind(null, p.id), {});
  const [pState, pAction, pAdding] = useActionState(addPartnerUser.bind(null, p.id), {});
  const [fState, fAction, fAdding] = useActionState(addFacilitator.bind(null, p.id), {});
  const yes = (b: boolean) => (b ? "Yes" : "No");

  return (
    <div className="rounded-lg border border-slate/15 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-midnight">{p.name}</p>
          <p className="text-xs text-slate">
            {PROGRAMME_TYPES[(p.programmeType ?? "other") as ProgrammeType] ?? "Programme"} · Run by {p.partnerName}
            {p.endsOn ? ` · ends ${formatDate(p.endsOn)}` : ""} · {p.members.length} member{p.members.length === 1 ? "" : "s"}
            {p.members.length < 5 ? " · group totals hidden until 5 members" : ""}
          </p>
        </div>
        {p.agreementSignedAt ? (
          <span className="rounded-full bg-teal/10 px-2.5 py-0.5 text-xs font-bold text-teal-ink">Agreement signed {formatDate(p.agreementSignedAt)}</span>
        ) : canEdit ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("Confirm the partner has signed the data-sharing agreement. Named data (for people who agreed) becomes visible to them.")) return;
              start(async () => {
                const r = await markAgreementSigned(p.id);
                if (r.error) setError(r.error);
              });
            }}
            className="rounded-lg border border-slate/25 px-3 py-1.5 text-xs font-bold text-midnight"
          >
            Data-sharing agreement signed
          </button>
        ) : (
          <span className="text-xs font-semibold text-slate">No agreement yet — no named data shared</span>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-coral-ink">{error}</p>}
      {p.joinCode && (
        <p className="mt-2 text-sm text-midnight">
          Join code for participants: <span className="rounded bg-cloud px-2 py-0.5 font-mono font-bold tracking-widest">{p.joinCode}</span>{" "}
          <span className="text-xs text-slate">— they sign up (phone is fine), then enter it at /pathways/join</span>
        </p>
      )}
      <p className="mt-1 text-xs text-slate">
        Partner dashboard access: {p.partnerUsers.length ? p.partnerUsers.join(", ") : "nobody yet"} ·{" "}
        <a href={`/partner/${p.id}`} className="font-semibold text-teal-ink underline">
          Preview their dashboard
        </a>
      </p>
      {canEdit && (
        <form action={pAction} className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-xs">
            <span className="mb-1 block font-semibold text-midnight">Give a partner staff member access (email or phone)</span>
            <input name="account" required className="w-64 rounded-lg border border-slate/25 px-2 py-1.5 text-xs" />
          </label>
          <button type="submit" disabled={pAdding} className="rounded-lg border border-slate/25 px-3 py-1.5 text-xs font-bold text-midnight disabled:opacity-60">
            {pAdding ? "Adding…" : "Give access"}
          </button>
          {pState.errors?.account && <span className="w-full text-xs text-coral-ink">{pState.errors.account[0]}</span>}
          {pState.message && <span className="w-full text-xs text-coral-ink">{pState.message}</span>}
          {"saved" in pState && pState.saved && <span className="w-full text-xs text-teal-ink">Access given.</span>}
        </form>
      )}

      <div className="mt-3 rounded-lg bg-cloud/60 p-3">
        <p className="text-xs font-bold text-midnight">Facilitators (run sessions, attendance, certificates)</p>
        {p.facilitators.length === 0 ? (
          <p className="mt-1 text-xs text-slate">None yet.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-xs">
            {p.facilitators.map((f) => (
              <li key={f.userId}>
                <span className="font-semibold text-midnight">{f.name}</span>{" "}
                {f.checkedAt ? (
                  <span className="text-teal-ink">· background check recorded {formatDate(f.checkedAt)}</span>
                ) : (
                  <>
                    <span className="text-coral-ink">· no background check yet — can&rsquo;t run sessions</span>
                    {canEdit && <BackgroundCheckForm programmeId={p.id} userId={f.userId} />}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <form action={fAction} className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-xs">
              <span className="mb-1 block font-semibold text-midnight">Add facilitator (email or phone)</span>
              <input name="account" required className="w-64 rounded-lg border border-slate/25 px-2 py-1.5 text-xs" />
            </label>
            <button type="submit" disabled={fAdding} className="rounded-lg border border-slate/25 px-3 py-1.5 text-xs font-bold text-midnight disabled:opacity-60">
              {fAdding ? "Adding…" : "Add"}
            </button>
            {fState.errors?.account && <span className="w-full text-xs text-coral-ink">{fState.errors.account[0]}</span>}
            {fState.message && <span className="w-full text-xs text-coral-ink">{fState.message}</span>}
          </form>
        )}
      </div>

      {p.members.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-xs">
            <thead className="text-slate">
              <tr>
                <th className="py-1 pe-2 font-semibold">Member</th>
                <th className="py-1 pe-2 font-semibold">Named progress</th>
                <th className="py-1 pe-2 font-semibold">Earnings</th>
                <th className="py-1 pe-2 font-semibold">Story</th>
                <th className="py-1 font-semibold">Last choice</th>
              </tr>
            </thead>
            <tbody>
              {p.members.map((m) => (
                <tr key={m.talentId} className="border-t border-slate/10 align-top">
                  <td className="py-1.5 pe-2">
                    <span className="font-semibold text-midnight">{m.name}</span>
                    {m.isMinor && <span className="ms-1 rounded-full bg-amber-tint px-1.5 text-[10px] font-bold text-warning-ink">Under 18</span>}
                    {m.isMinor && !m.consent?.guardian && canEdit && <GuardianForm programmeId={p.id} talentId={m.talentId} />}
                  </td>
                  <td className="py-1.5 pe-2">{m.consent ? yes(m.consent.named) : "—"}</td>
                  <td className="py-1.5 pe-2">{m.consent ? yes(m.consent.earnings) : "—"}</td>
                  <td className="py-1.5 pe-2">{m.consent ? yes(m.consent.story) : "—"}</td>
                  <td className="py-1.5 text-slate">
                    {m.consent ? `${formatDate(m.consent.at)} · ${m.consent.version}${m.consent.guardian ? ` · guardian: ${m.consent.guardian}` : ""}` : "Not chosen yet (nothing shared)"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <form action={action} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs">
            <span className="mb-1 block font-semibold text-midnight">Add member by email</span>
            <input name="email" type="email" required className="w-60 rounded-lg border border-slate/25 px-2 py-1.5 text-xs" />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-midnight">
            <input type="checkbox" name="isMinor" className="accent-teal" /> Under 18
          </label>
          <button type="submit" disabled={adding} className="rounded-lg border border-slate/25 px-3 py-1.5 text-xs font-bold text-midnight disabled:opacity-60">
            {adding ? "Adding…" : "Add"}
          </button>
          {state.errors?.email && <span className="w-full text-xs text-coral-ink">{state.errors.email[0]}</span>}
          {state.message && <span className="w-full text-xs text-coral-ink">{state.message}</span>}
        </form>
      )}
    </div>
  );
}

function GuardianForm({ programmeId, talentId }: { programmeId: string; talentId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(recordGuardianConsent.bind(null, programmeId, talentId), {});
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 block text-[11px] font-bold text-teal-ink underline">
        Record guardian consent
      </button>
    );
  }
  return (
    <form action={action} className="mt-2 space-y-1.5 rounded-lg bg-cloud p-2">
      <p className="text-[11px] text-slate">From the signed paper form. Tick only what the guardian agreed to.</p>
      <input name="guardianName" required placeholder="Guardian's full name" className="w-full rounded border border-slate/25 px-2 py-1 text-xs" />
      {(
        [
          ["share_named_progress", "Named progress"],
          ["share_earnings", "Earnings"],
          ["share_story", "Story"],
        ] as const
      ).map(([n, l]) => (
        <label key={n} className="flex items-center gap-1.5 text-[11px]">
          <input type="checkbox" name={n} className="accent-teal" /> {l}
        </label>
      ))}
      <button type="submit" disabled={pending} className="rounded bg-teal px-2 py-1 text-[11px] font-bold text-midnight disabled:opacity-60">
        {pending ? "Saving…" : "Save guardian consent"}
      </button>
      {state.errors?.guardianName && <p className="text-[11px] text-coral-ink">{state.errors.guardianName[0]}</p>}
      {"saved" in state && state.saved && <p className="text-[11px] text-teal-ink">Saved.</p>}
    </form>
  );
}

function BackgroundCheckForm({ programmeId, userId }: { programmeId: string; userId: string }) {
  const [state, action, pending] = useActionState(recordBackgroundCheck.bind(null, programmeId, userId), {});
  if ("saved" in state && state.saved) return <span className="ms-1 text-teal-ink">· recorded</span>;
  return (
    <form action={action} className="mt-1 flex flex-wrap items-center gap-1.5">
      <input name="note" required minLength={5} placeholder="What was checked, e.g. police clearance seen 3 Jan" className="w-72 rounded border border-slate/25 px-2 py-1 text-[11px]" />
      <button type="submit" disabled={pending} className="rounded bg-teal px-2 py-1 text-[11px] font-bold text-midnight disabled:opacity-60">
        {pending ? "Saving…" : "Record background check"}
      </button>
      {state.errors?.note && <span className="w-full text-[11px] text-coral-ink">{state.errors.note[0]}</span>}
    </form>
  );
}
