import type { Metadata } from "next";
import { requireOrganisationMembership } from "@/lib/dal/organisation";
import { createClient } from "@/lib/supabase/server";
import { InviteForm } from "./invite-form";
import { MemberRow } from "./member-row";
import { PendingInvitationRow } from "./pending-invitation-row";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const { org, myRole } = await requireOrganisationMembership();
  const supabase = await createClient();

  const { data: memberships } = await supabase
    .from("organisation_members")
    .select("user_id, role")
    .eq("organisation_id", org.id)
    .order("role", { ascending: true });

  const userIds = (memberships ?? []).map((m) => m.user_id);
  const { data: profiles } =
    userIds.length > 0 ? await supabase.from("profiles").select("id, full_name").in("id", userIds) : { data: [] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const { data: pendingInvitations } =
    myRole === "admin"
      ? await supabase
          .from("organisation_team_invitations")
          .select("id, email, role, token, expires_at, created_at")
          .eq("organisation_id", org.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
      : { data: [] };

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">Team — {org.name}</h1>
      <p className="mt-1 text-sm text-slate">
        Admins can invite teammates and manage opportunities; members can view and manage
        opportunities but not the team itself.
      </p>

      <ul className="mt-6 space-y-2">
        {(memberships ?? []).map((m) => (
          <MemberRow
            key={m.user_id}
            organisationId={org.id}
            userId={m.user_id}
            name={nameById.get(m.user_id) ?? "Unnamed"}
            role={m.role}
            isRepresentative={m.user_id === org.representative_id}
            canManage={myRole === "admin"}
          />
        ))}
      </ul>

      {myRole === "admin" && pendingInvitations && pendingInvitations.length > 0 && (
        <div className="mt-8">
          <h2 className="font-bold text-midnight">Pending invitations</h2>
          <p className="mt-1 text-xs text-slate">
            Not yet accepted — each expires 7 days after it was sent, and stops working automatically after that.
          </p>
          <ul className="mt-3 space-y-2">
            {pendingInvitations.map((inv) => (
              <PendingInvitationRow
                key={inv.id}
                organisationId={org.id}
                invitationId={inv.id}
                email={inv.email}
                role={inv.role}
                token={inv.token}
                expiresAt={inv.expires_at}
              />
            ))}
          </ul>
        </div>
      )}

      {myRole === "admin" && (
        <div className="mt-8">
          <h2 className="font-bold text-midnight">Invite a teammate</h2>
          <InviteForm organisationId={org.id} />
        </div>
      )}
    </main>
  );
}
