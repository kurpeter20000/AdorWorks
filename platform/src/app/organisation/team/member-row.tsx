"use client";

import { useState, useTransition } from "react";
import { changeTeamMemberRole, removeTeamMember } from "@/lib/actions/organisationTeam";
import type { OrganisationMemberRole } from "@/lib/database.types";
import { Badge } from "@/components/ui/badge";

const ROLE_LABEL: Record<OrganisationMemberRole, string> = {
  member: "Member",
  admin: "Admin",
  recruiter: "Recruiter",
  hiring_manager: "Hiring manager",
  finance: "Finance",
  viewer: "Viewer",
};

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
  role: OrganisationMemberRole;
  isRepresentative: boolean;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Controlled, so a refused change snaps back instead of showing a role
  // the member doesn't actually have.
  const [currentRole, setCurrentRole] = useState<OrganisationMemberRole>(role);

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-slate/15 bg-white p-3">
      <div>
        <p className="text-sm font-semibold text-midnight">
          {name}
          {isRepresentative && <span className="ms-2 text-xs font-normal text-slate">(representative)</span>}
        </p>
        {error && <p className="text-xs text-coral-ink">{error}</p>}
      </div>
      {canManage ? (
        <div className="flex items-center gap-2">
          <select
            aria-label={`Team role for ${name}`}
            value={currentRole}
            disabled={pending}
            onChange={(e) => {
              const newRole = e.target.value as OrganisationMemberRole;
              const previous = currentRole;
              setCurrentRole(newRole);
              setError(null);
              startTransition(async () => {
                try {
                  const result = await changeTeamMemberRole(organisationId, userId, newRole);
                  if (result.error) {
                    setCurrentRole(previous);
                    setError(result.error);
                  }
                } catch {
                  setCurrentRole(previous);
                  setError("Could not update their role.");
                }
              });
            }}
            className="rounded-lg border border-slate/25 px-2 py-1 text-xs"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
            <option value="recruiter">Recruiter</option>
            <option value="hiring_manager">Hiring manager</option>
            <option value="finance">Finance</option>
            <option value="viewer">Viewer</option>
          </select>
          {!isRepresentative && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  try {
                    const result = await removeTeamMember(organisationId, userId);
                    if (result.error) setError(result.error);
                  } catch {
                    setError("Could not remove them.");
                  }
                });
              }}
              className="text-xs font-semibold text-coral-ink underline disabled:opacity-60"
            >
              Remove
            </button>
          )}
        </div>
      ) : (
        // Read-only: this visitor cannot change this member's role (not an
        // admin) -- a Badge, not a control, is the honest signal here.
        <Badge variant="neutral">{ROLE_LABEL[role] ?? role}</Badge>
      )}
    </li>
  );
}
