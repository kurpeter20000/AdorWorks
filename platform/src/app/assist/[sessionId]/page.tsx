import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { AssistedFieldForm } from "./assisted-field-form";
import { FinishSessionButton } from "./finish-session-button";

export const metadata: Metadata = { title: "Assisted editing" };

export default async function AssistSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const session = await requireRole("onboarding_agent");
  const { sessionId } = await params;
  const admin = createAdminClient();

  const { data: assistSession } = await admin
    .from("assistance_sessions")
    .select("id, status, user_id, scope, expires_at")
    .eq("id", sessionId)
    .eq("agent_id", session.userId)
    .maybeSingle();
  if (!assistSession) notFound();

  if (assistSession.status !== "active") {
    return (
      <main className="mx-auto max-w-2xl p-6 sm:p-8">
        <p className="text-sm text-slate">
          This session isn&rsquo;t active ({assistSession.status.replace("_", " ")}) — nothing to edit.
        </p>
      </main>
    );
  }

  const { data: profile } = await admin
    .from("talent_profiles")
    .select("*")
    .eq("id", assistSession.user_id)
    .maybeSingle();

  const fields = assistSession.scope.fields;

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">Assisted editing</h1>
      <p className="mt-1 text-sm text-slate">
        Only the fields listed below are in scope for this session. Every change is saved
        immediately and logged.
      </p>

      <div className="mt-6 space-y-3">
        {fields.map((field) => {
          const raw = profile ? (profile as unknown as Record<string, unknown>)[field] : null;
          const initialValue = Array.isArray(raw) ? raw.join(", ") : ((raw as string | null) ?? "");
          return <AssistedFieldForm key={field} sessionId={assistSession.id} field={field} initialValue={initialValue} />;
        })}
      </div>

      <div className="mt-6">
        <FinishSessionButton sessionId={assistSession.id} />
      </div>
    </main>
  );
}
