import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { notifyUser, NOTIFICATION_TYPES } from "./notifications";
import { jobMatchesAlert } from "./jobAlerts";
import { sendEmailSafely, getUserEmail } from "@/lib/email";
import { renderEmail, escapeHtml } from "@/lib/emailTemplate";
import { buildUnsubscribeUrl } from "@/lib/unsubscribeToken";

/** One publish never alerts more people than this (protects the email quota). */
const MAX_RECIPIENTS = 2000;

/**
 * Sends tailored job alerts (0126) for a job staff just published: every
 * talent who switched alerts on and whose filters match gets an in-app
 * alert (and WhatsApp, via notifyUser, once that is connected), plus an
 * email if they kept email on. The dedupe key means a re-publish of the
 * same job never alerts anyone twice. Fails open: alert problems never
 * undo the publish.
 */
export async function sendJobAlerts(admin: SupabaseClient<Database>, opportunityId: string): Promise<number> {
  try {
    const { data: job } = await admin
      .from("opportunities")
      .select("id, title, brief, category, skills, engagement_type, work_mode, location, status, visibility")
      .eq("id", opportunityId)
      .maybeSingle();
    if (!job || job.status !== "open" || job.visibility !== "public") return 0;

    const { data: prefs } = await admin
      .from("alert_preferences")
      .select("user_id, job_alert_categories, job_alert_keywords, job_alert_engagement_types, job_alert_work_modes, job_alert_locations, job_alert_email")
      .eq("job_alerts_enabled", true)
      .limit(10000);
    if (!prefs || prefs.length === 0) return 0;

    const ids = prefs.map((p) => p.user_id);
    const talentById = new Map<string, { category: string | null; skills: string[] | null }>();
    const activeTalent = new Set<string>();
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const [{ data: talents }, { data: people }] = await Promise.all([
        admin.from("talent_profiles").select("id, category, skills").in("id", chunk),
        admin.from("profiles").select("id, role, status").in("id", chunk),
      ]);
      for (const t of talents ?? []) talentById.set(t.id, { category: t.category, skills: t.skills });
      for (const p of people ?? []) if (p.role === "talent" && p.status === "active") activeTalent.add(p.id);
    }

    const matches = prefs
      .filter((p) => activeTalent.has(p.user_id) && talentById.has(p.user_id))
      .filter((p) => jobMatchesAlert(p, job, talentById.get(p.user_id)!))
      .slice(0, MAX_RECIPIENTS);

    const link = `/jobs/${job.id}`;
    for (const p of matches) {
      await notifyUser(admin, {
        userId: p.user_id,
        type: NOTIFICATION_TYPES.JOB_ALERT,
        title: "New job that matches your alert",
        body: job.title,
        link,
        dedupeKey: `job-${job.id}`,
      });
      if (p.job_alert_email) {
        const email = await getUserEmail(admin, p.user_id);
        await sendEmailSafely(
          email,
          `New job on AdorWorks: ${job.title}`,
          renderEmail({
            heading: "A new job matches your alert",
            paragraphs: [
              `<strong>${escapeHtml(job.title)}</strong>`,
              ...(job.brief ? [escapeHtml(job.brief.slice(0, 280)) + (job.brief.length > 280 ? "…" : "")] : []),
              "You're getting this because you switched on job alerts. You can change or turn them off any time in your notification settings.",
            ],
            ctaLabel: "View the job",
            ctaUrl: `${process.env.NEXT_PUBLIC_SITE_URL}${link}`,
            unsubscribeUrl: buildUnsubscribeUrl(p.user_id),
          }),
          { admin, recipientUserId: p.user_id }
        );
      }
    }
    return matches.length;
  } catch (err) {
    console.error("job alerts failed for %s:", opportunityId, err);
    return 0;
  }
}
