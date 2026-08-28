import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/lib/actions/auth";
import { getDashboardExperience } from "@/lib/domain/navigation";
import { getDashboardKind } from "@/lib/domain/roles";
import { getTalentReadiness, getEmployerReadiness } from "@/lib/domain/readiness";
import { getMyOrganisationMembership } from "@/lib/dal/organisation";
import { StatePanel } from "@/components/state-panel";
import { PhoneVerificationWidget } from "./phone-verification-widget";
import { AssistanceConsentWidget } from "./assistance-consent-widget";
import { ReadinessPanel } from "./readiness-panel";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; onboarding?: string }>;
}) {
  const session = await requireSession();
  const query = await searchParams;
  const experience = getDashboardExperience(session.role);
  const dashboardKind = getDashboardKind(session.role);

  const supabase = await createClient();
  const { data: pendingAssistance } = await supabase
    .from("assistance_sessions")
    .select("id, scope, status")
    .eq("user_id", session.userId)
    .in("status", ["pending_consent", "active"])
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Readiness/Trust/Visibility (master doc §19A) — only computed once the
  // underlying profile exists, so a fresh signup who hasn't started
  // onboarding yet just sees the existing "Onboarding" action card
  // instead of a panel listing every field as missing.
  let readinessState = null;
  if (dashboardKind === "talent") {
    const { data: talentProfile } = await supabase
      .from("talent_profiles")
      .select(
        "headline, bio, skills, category, location, avatar_path, verification_tier, public_visible, safety_orientation_completed_at"
      )
      .eq("id", session.userId)
      .maybeSingle();
    if (talentProfile) readinessState = getTalentReadiness(talentProfile);
  } else if (dashboardKind === "employer") {
    const membership = await getMyOrganisationMembership();
    if (membership) {
      const { count: opportunityCount } = await supabase
        .from("opportunities")
        .select("id", { count: "exact", head: true })
        .eq("organisation_id", membership.org.id);
      readinessState = getEmployerReadiness(membership.org, (opportunityCount ?? 0) > 0);
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-midnight">
            Welcome{session.fullName ? `, ${session.fullName}` : ""}
          </h1>
          <p className="text-sm text-slate">Signed in as {session.email} · role: {session.role}</p>
        </div>
        <form action={logout}>
          <button type="submit" className="rounded-lg border border-slate/30 px-3 py-1.5 text-sm font-semibold">
            Sign out
          </button>
        </form>
      </div>

      {query.error === "forbidden" && (
        <div className="mt-6">
          <StatePanel title="You do not have access to that workspace" tone="danger" role="alert">
            Your account has been returned to the workspace available for its current role.
          </StatePanel>
        </div>
      )}

      {query.onboarding === "submitted" && (
        <div className="mt-6">
          <StatePanel title="Onboarding submitted" tone="success">
            Your details were received and can now move through the existing review workflow.
          </StatePanel>
        </div>
      )}

      {!session.phoneVerified && <PhoneVerificationWidget />}

      {pendingAssistance &&
        (pendingAssistance.status === "pending_consent" || pendingAssistance.status === "active") && (
          <AssistanceConsentWidget
            sessionId={pendingAssistance.id}
            freshAccount={!!pendingAssistance.scope.freshAccount}
            status={pendingAssistance.status}
          />
        )}

      {readinessState && <ReadinessPanel state={readinessState} />}

      <section className="mt-8">
        <h2 className="text-xl font-extrabold text-midnight">{experience.title}</h2>
        <p className="mt-1 text-sm text-slate">{experience.description}</p>

        {experience.actions.length > 0 ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {experience.actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className={`rounded-xl border p-4 transition-colors ${
                  action.primary
                    ? "border-teal bg-teal text-midnight hover:bg-teal/80"
                    : "border-slate/20 bg-white hover:border-teal/50"
                }`}
              >
                <span className="block font-bold">{action.label}</span>
                <span className="mt-1 block text-xs text-slate">{action.description}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <StatePanel title="Workspace unchanged" tone="info">
              This role continues in its existing operational workspace while the integrated experience is built behind
              feature flags.
            </StatePanel>
          </div>
        )}
      </section>
    </main>
  );
}
