import type { Metadata } from "next";
import { requireOrganisationMembership } from "@/lib/dal/organisation";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/domain/format";
import { ACTIVITY_EVENT_LABEL } from "@/lib/domain/activityLog";
import { StatePanel } from "@/components/state-panel";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Activity") };
}

/**
 * What the org's own team has done — previously only ever visible to
 * whoever performed a given action themselves. Backed by
 * organisation_activity_log() (0102), a security-definer function since
 * audit_events itself has no organisation_id column and is otherwise
 * staff-only to read.
 */
export default async function OrganisationActivityPage() {
  const { org } = await requireOrganisationMembership();
  const supabase = await createClient();
  const t = await getT();

  const { data: events, error } = await supabase.rpc("organisation_activity_log", { p_limit: 50 });

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">{t("Activity — {org}", { org: org.name })}</h1>
      <p className="mt-1 text-sm text-slate">{t("What your team has done recently — opportunities, offers, contracts and team changes.")}</p>

      {error && (
        <div className="mt-4">
          <StatePanel title={t("Couldn't load activity")} tone="danger" role="alert">
            {t("Refresh the page to try again.")}
          </StatePanel>
        </div>
      )}

      {!error && (events ?? []).length === 0 && <p className="mt-6 text-sm text-slate">{t("Nothing yet.")}</p>}

      {(events ?? []).length > 0 && (
        <ul className="mt-6 space-y-2">
          {(events ?? []).map((e) => (
            <li key={e.id} className="rounded-xl border border-slate/15 bg-white p-4">
              <p className="text-sm text-midnight">{t(ACTIVITY_EVENT_LABEL[e.name] ?? e.name)}</p>
              <p className="mt-1 text-xs text-slate">
                {e.actor_is_staff ? t("AdorWorks") : (e.actor_name ?? t("A former teammate"))} · {formatDateTime(e.occurred_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
