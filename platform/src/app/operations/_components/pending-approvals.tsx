"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { approveAccount, declineAccount } from "@/lib/actions/accountApproval";
import type { PendingEmployer, PendingTalent } from "@/lib/dal/approvals";
import { ActionRow, ActionStatus, Badge, Btn, KV, Notice, ReasonAction, Section, StaffTable, fmtDate, humanize, useAction } from "./staff-ui";

const Tick = ({ ok, yes, no }: { ok: boolean; yes: string; no: string }) => (
  <span className={`text-xs font-semibold ${ok ? "text-teal-ink" : "text-slate"}`}>{ok ? `✓ ${yes}` : no}</span>
);

function Decide({ userId, who, onDone }: { userId: string; who: string; onDone: () => void }) {
  const { run, pending, status } = useAction(onDone);
  const act = (p: Promise<{ error?: string }>) =>
    p.then((r) => {
      if (r.error) throw new Error(r.error);
    });
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-slate/15 bg-white p-3">
      <p className="text-sm font-bold text-midnight">Decision</p>
      <ActionRow>
        <Btn variant="primary" disabled={pending} onClick={() => run(() => act(approveAccount(userId)), `${who} approved — they've been told.`)}>
          Approve account
        </Btn>
      </ActionRow>
      <ReasonAction
        label="Decline"
        placeholder="Reason for declining — the person will see it (required)"
        disabled={pending}
        onSubmit={(reason) => run(() => act(declineAccount(userId, reason)), `${who} declined — they've been told why.`)}
      />
      <ActionStatus status={status} />
    </div>
  );
}

/**
 * New sign-ups waiting for approval (0128). Talent in the Talent section,
 * employers in Organisations. The oldest first, so nobody waits longest.
 */
export function PendingTalentApprovals({ rows, total, detail }: { rows: PendingTalent[]; total: number; detail?: (id: string) => ReactNode }) {
  const router = useRouter();
  return (
    <Section title={`New talent sign-ups waiting for approval (${total})`}>
      <p className="mb-2 text-sm text-pretty text-slate">
        Check who they are before approving: name, contact, the ID they uploaded and their profile. Until approved they can finish their profile but can&apos;t apply for work.
      </p>
      <StaffTable
        columns={["Name", "Profession", "Location", "Contact", "Checks", "Signed up"]}
        rows={rows}
        rowKey={(r) => r.id}
        cells={(r) => [
          <span key="n" className="block min-w-[9rem]">
            <span className="block font-semibold text-midnight">{r.name}</span>
            {r.legalName && r.legalName !== r.name && <span className="block text-xs text-slate">{r.legalName}</span>}
          </span>,
          <span key="p" className="block min-w-[9rem]">
            <span className="block">{r.headline || "—"}</span>
            <span className="block text-xs text-slate">{humanize(r.category)}</span>
          </span>,
          r.place || "—",
          <span key="c" className="block min-w-[10rem] text-xs">
            <span className="block [overflow-wrap:anywhere]">{r.email || "no email"}</span>
            <span className="block">{r.phone ? `${r.phone}${r.phoneVerified ? " ✓" : ""}` : "no phone"}</span>
          </span>,
          <span key="k" className="block">
            <Tick ok={r.idSubmitted} yes="ID uploaded" no="No ID yet" />
            <br />
            <Tick ok={r.profileComplete} yes="Profile complete" no="Profile unfinished" />
          </span>,
          fmtDate(r.signedUpAt),
        ]}
        detail={(r) => (
          <div onClick={(e) => e.stopPropagation()}>
            {detail ? detail(r.id) : null}
            <Decide userId={r.id} who={r.name} onDone={() => router.refresh()} />
          </div>
        )}
        empty="No one is waiting — every talent sign-up has been decided."
      />
    </Section>
  );
}

export function PendingEmployerApprovals({ rows, total }: { rows: PendingEmployer[]; total: number }) {
  const router = useRouter();
  return (
    <Section title={`New employer sign-ups waiting for approval (${total})`}>
      <p className="mb-2 text-sm text-pretty text-slate">
        Approving the person lets them send jobs for review. Their organisation still goes through the verification checklist below before any job is published.
      </p>
      <StaffTable
        columns={["Name", "Organisation", "Location", "Contact", "Signed up"]}
        rows={rows}
        rowKey={(r) => r.id}
        cells={(r) => [
          <span key="n" className="block min-w-[9rem] font-semibold text-midnight">{r.name}</span>,
          r.organisation ? (
            <span key="o" className="block min-w-[9rem]">
              <span className="block">{r.organisation.name}</span>
              <span className="block text-xs text-slate">{humanize(r.organisation.type)}</span>
            </span>
          ) : (
            <span key="o" className="text-xs text-slate">Not set up yet</span>
          ),
          r.organisation?.place || "—",
          <span key="c" className="block min-w-[10rem] text-xs">
            <span className="block [overflow-wrap:anywhere]">{r.email || "no email"}</span>
            <span className="block">{r.phone ? `${r.phone}${r.phoneVerified ? " ✓" : ""}` : "no phone"}</span>
          </span>,
          fmtDate(r.signedUpAt),
        ]}
        detail={(r) => (
          <div onClick={(e) => e.stopPropagation()}>
            {r.organisation ? (
              <KV
                items={[
                  ["Organisation", r.organisation.name],
                  ["Type", humanize(r.organisation.type)],
                  ["Location", r.organisation.place || "Not given"],
                  ["Organisation verification", <Badge key="v" value={r.organisation.verification} />],
                ]}
              />
            ) : (
              <Notice>They haven&apos;t set up their organisation yet. You can approve the person now, or wait until they add it.</Notice>
            )}
            <Decide userId={r.id} who={r.name} onDone={() => router.refresh()} />
          </div>
        )}
        empty="No one is waiting — every employer sign-up has been decided."
      />
    </Section>
  );
}
