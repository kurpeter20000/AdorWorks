import type { Metadata } from "next";
import { requireOrganisationMembership } from "@/lib/dal/organisation";
import { createClient } from "@/lib/supabase/server";
import { InviteForm } from "./invite-form";
import { MemberRow } from "./member-row";

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

      {myRole === "admin" && (
        <div className="mt-8">
          <h2 className="font-bold text-midnight">Invite a teammate</h2>
          <InviteForm organisationId={org.id} />
        </div>
      )}
    </main>
  );
}
