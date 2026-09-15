"use client";

import { useState, useTransition } from "react";
import { revokeTeamInvitation } from "@/lib/actions/organisationTeam";
import type { OrganisationMemberRole } from "@/lib/database.types";

const ROLE_LABEL: Record<OrganisationMemberRole, string> = {
  member: "Member",
  admin: "Admin",
  recruiter: "Recruiter",
  hiring_manager: "Hiring manager",
  finance: "Finance",
  viewer: "Viewer",
};

export function PendingInvitationRow({
  organisationId,
  invitationId,
  email,
  role,
  token,
  expiresAt,
}: {
  organisationId: string;
  invitationId: string;
  email: string;
  role: OrganisationMemberRole;
  token: string;
  expiresAt: string;
}) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [revoked, setRevoked] = useState(false);

  function copyLink() {
    const link = `${window.location.origin}/organisation/invite/${token}`;
    navigator.clipboard
      .writeText(link)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        /* clipboard access can fail silently in some browsers — the link is still shown below */
      });
  }

  if (revoked) return null;

  return (
    <li className="rounded-lg border border-slate/15 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-midnight">{email}</p>
          <p className="text-xs text-slate">
            {ROLE_LABEL[role] ?? role} · expires {new Date(expiresAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={copyLink} className="text-xs font-semibold text-teal-ink underline">
            {copied ? "Copied!" : "Copy invite link"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await revokeTeamInvitation(organisationId, invitationId);
                setRevoked(true);
              });
            }}
            className="text-xs font-semibold text-coral-ink underline disabled:opacity-60"
          >
            Revoke
          </button>
        </div>
      </div>
    </li>
  );
}
