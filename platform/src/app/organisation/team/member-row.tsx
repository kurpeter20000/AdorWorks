"use client";

import { useState, useTransition } from "react";
import { changeTeamMemberRole, removeTeamMember } from "@/lib/actions/organisationTeam";

export function MemberRow({
  organisationId,
  userId,
  name,
  role,
  isRepresentative,
  canManage,
}: {
  organisationId: string;
  userId: string;
  name: string;
  role: "member" | "admin";
  isRepresentative: boolean;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-slate/15 bg-white p-3">
      <div>
        <p className="text-sm font-semibold text-midnight">
          {name}
          {isRepresentative && <span className="ml-2 text-xs font-normal text-slate">(representative)</span>}
        </p>
        {error && <p className="text-xs text-coral">{error}</p>}
      </div>
      {canManage ? (
        <div className="flex items-center gap-2">
          <select
            defaultValue={role}
            disabled={pending}
            onChange={(e) => {
              const newRole = e.target.value as "member" | "admin";
              setError(null);
              startTransition(async () => {
                try {
                  await changeTeamMemberRole(organisationId, userId, newRole);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not update their role.");
                }
              });
            }}
            className="rounded-lg border border-slate/25 px-2 py-1 text-xs"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          {!isRepresentative && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  try {
                    await removeTeamMember(organisationId, userId);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not remove them.");
                  }
                });
              }}
              className="text-xs font-semibold text-coral underline disabled:opacity-60"
            >
              Remove
            </button>
          )}
        </div>
      ) : (
        <span className="rounded-full bg-cloud px-3 py-1 text-xs font-semibold text-slate">
          {role === "admin" ? "Admin" : "Member"}
        </span>
      )}
    </li>
  );
}
