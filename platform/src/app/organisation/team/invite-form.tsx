"use client";

import { useActionState } from "react";
import { inviteTeamMember, type InviteState } from "@/lib/actions/organisationTeam";

const initialState: InviteState = {};

export function InviteForm({ organisationId }: { organisationId: string }) {
  const boundAction = inviteTeamMember.bind(null, organisationId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className="mt-3 space-y-2 rounded-lg border border-slate/15 bg-white p-4">
      <input
        name="email"
        type="email"
        placeholder="Teammate's email"
        required
        className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
      />
      {state.errors?.email && <p className="text-sm text-coral">{state.errors.email[0]}</p>}
      <input
        name="fullName"
        placeholder="Full name (optional)"
        className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
      />
      <select name="role" defaultValue="member" className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm">
        <option value="member">Member — can view and manage opportunities</option>
        <option value="admin">Admin — can also manage the team</option>
      </select>
      {state.message && <p className="text-sm text-coral">{state.message}</p>}
      {/* inviteTeamMember returns {} (or {temporaryPassword}) on success —
          state !== initialState is what distinguishes "just succeeded"
          from "never submitted yet", same empty-success-object shape as
          the assistance-request form. */}
      {state !== initialState && !state.message && !state.errors && (
        <p className="rounded-lg bg-teal/10 px-3 py-2 text-sm text-teal">
          {state.temporaryPassword ? (
            <>
              Account created. Temporary password (give this to them, it won&rsquo;t be shown again):{" "}
              <strong>{state.temporaryPassword}</strong>
            </>
          ) : (
            "Added to the team — they already had an account, so their existing password still works."
          )}
        </p>
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
