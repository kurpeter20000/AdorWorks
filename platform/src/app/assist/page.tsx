import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "My assistance sessions" };

// Reads via the admin client throughout this page: RLS grants an agent no
// direct read access to someone else's talent_profiles (correct — they
// should only see what's in scope, enforced on the [sessionId] page), so
// even just showing "who am I helping" on this list needs the same
// service-role-mediated pattern, scoped tightly to this agent's own
// active sessions.
export default async function AssistPage() {
  const session = await requireRole("onboarding_agent");
  const admin = createAdminClient();

  const { data: sessions } = await admin
    .from("assistance_sessions")
    .select("id, status, expires_at, user_id")
    .eq("agent_id", session.userId)
    .in("status", ["active", "pending_consent"])
    .order("created_at", { ascending: false });

  const userIds = [...new Set((sessions ?? []).map((s) => s.user_id))];
  const { data: profiles } =
    userIds.length > 0
      ? await admin.from("talent_profiles").select("id, display_name").in("id", userIds)
      : { data: [] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">My assistance sessions</h1>

      {!sessions || sessions.length === 0 ? (
        <p className="mt-8 text-sm text-slate">No active sessions right now.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {sessions.map((s) => (
            <li key={s.id} className="rounded-xl border border-slate/15 bg-white p-5">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-midnight">{nameById.get(s.user_id) ?? "Not yet named"}</p>
                <span className="rounded-full bg-cloud px-3 py-1 text-xs font-semibold text-slate">
                  {s.status === "pending_consent" ? "Waiting for their consent" : "Active"}
                </span>
              </div>
              {s.status === "active" && (
                <Link href={`/assist/${s.id}`} className="mt-3 inline-block text-sm font-semibold text-teal-ink underline">
                  Continue helping
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
