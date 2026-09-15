"use client";

import { useActionState, useState } from "react";
import { inviteTeamMember, type InviteState } from "@/lib/actions/organisationTeam";

const initialState: InviteState = {};

export function InviteForm({ organisationId }: { organisationId: string }) {
  const boundAction = inviteTeamMember.bind(null, organisationId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const [copied, setCopied] = useState(false);

  const inviteLink = state.inviteToken && typeof window !== "undefined" ? `${window.location.origin}/organisation/invite/${state.inviteToken}` : null;

  return (
    <form action={formAction} className="mt-3 space-y-2 rounded-lg border border-slate/15 bg-white p-4">
      <input
        name="email"
        type="email"
        placeholder="Teammate's email"
        required
        className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
      />
      {state.errors?.email && <p className="text-sm text-coral-ink">{state.errors.email[0]}</p>}
      <input
        name="fullName"
        placeholder="Full name (optional)"
        className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
      />
      <select name="role" defaultValue="member" className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm">
        <option value="member">Member — can view and manage opportunities</option>
        <option value="admin">Admin — can also manage the team</option>
        <option value="recruiter">Recruiter</option>
        <option value="hiring_manager">Hiring manager</option>
        <option value="finance">Finance</option>
        <option value="viewer">Viewer — read-only, can&rsquo;t post or edit opportunities</option>
      </select>
      <p className="text-xs text-slate">
        Recruiter, hiring manager, and finance behave like Member today — labels only, for now.
      </p>
      {state.message && <p className="text-sm text-coral-ink">{state.message}</p>}
      {/* inviteTeamMember returns {inviteToken, ...} on success —
          state !== initialState is what distinguishes "just succeeded"
          from "never submitted yet", same empty-success-object shape as
          the assistance-request form. */}
      {state !== initialState && !state.message && !state.errors && (
        <div className="space-y-2 rounded-lg bg-teal/10 px-3 py-2 text-sm text-teal-ink">
          {state.temporaryPassword && (
            <p>
              Account created. Temporary password (give this to them, it won&rsquo;t be shown again):{" "}
              <strong>{state.temporaryPassword}</strong>
            </p>
          )}
          <p>
            Invitation sent — it expires in 7 days. Share this link with them to accept it (nothing is delivered by
            email automatically yet):
          </p>
          {inviteLink && (
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded bg-white px-2 py-1 text-xs text-midnight">{inviteLink}</code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(inviteLink).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
                }}
                className="whitespace-nowrap text-xs font-semibold underline"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          )}
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-violet px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
      >
        {pending ? "Inviting…" : "Invite"}
      </button>
    </form>
  );
}
