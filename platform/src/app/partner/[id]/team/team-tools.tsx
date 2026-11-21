"use client";

import { useActionState, useState, useTransition } from "react";
import { partnerInviteTeamMember, partnerRemoveTeamMember, partnerSetCohortOpen } from "@/lib/actions/partnerProgrammes";
import { useT } from "@/i18n/client";

export function InviteForm({ programmeId }: { programmeId: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(partnerInviteTeamMember.bind(null, programmeId), {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="text-sm font-semibold text-midnight">
        {t("Email or phone number")}
        <input name="account" required className="mt-1 block min-h-11 w-64 rounded-control border border-slate/25 px-3 text-sm font-normal" />
      </label>
      <label className="text-sm font-semibold text-midnight">
        {t("Role")}
        <select name="role" defaultValue="viewer" className="mt-1 block min-h-11 rounded-control border border-slate/25 px-3 text-sm font-normal">
          <option value="viewer">{t("Viewer — sees results")}</option>
          <option value="admin">{t("Admin — manages the cohort and team")}</option>
          <option value="facilitator">{t("Facilitator — runs sessions")}</option>
        </select>
      </label>
      <button type="submit" disabled={pending} className="min-h-11 rounded-control bg-teal px-4 text-sm font-bold text-midnight disabled:opacity-60">
        {pending ? t("Adding…") : t("Add to team")}
      </button>
      {state.errors?.account && <p className="w-full text-xs text-coral-ink">{t(state.errors.account[0])}</p>}
      {state.message && <p className="w-full text-xs text-coral-ink">{t(state.message)}</p>}
      {"saved" in state && state.saved && (
        <p className="w-full text-xs text-teal-ink">
          {state.saved === "facilitator" ? t("Added. They can run sessions once AdorWorks records their background check.") : t("Added to the team.")}
        </p>
      )}
    </form>
  );
}

export function RemoveButton({ programmeId, userId, kind }: { programmeId: string; userId: string; kind: "partner" | "facilitator" }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(t("Remove this person from the cohort team?"))) return;
          start(async () => {
            const r = await partnerRemoveTeamMember(programmeId, userId, kind);
            if (r.error) setError(r.error);
          });
        }}
        className="text-xs font-semibold text-coral-ink underline disabled:opacity-60"
      >
        {t("Remove")}
      </button>
      {error && <span className="ms-2 text-xs text-coral-ink">{t(error)}</span>}
    </>
  );
}

export function CohortOpenToggle({ programmeId, open }: { programmeId: string; open: boolean }) {
  const t = useT();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => void (await partnerSetCohortOpen(programmeId, !open)))}
      className="min-h-11 rounded-control border border-slate/30 px-3 text-sm font-bold text-midnight disabled:opacity-60"
    >
      {open ? t("Close to new participants") : t("Reopen to new participants")}
    </button>
  );
}
