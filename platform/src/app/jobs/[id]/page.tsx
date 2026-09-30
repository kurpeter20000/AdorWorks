import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { BadgeCheck, CalendarClock, MapPin } from "lucide-react";
import { verifySession } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { formatCompensation, formatDate } from "@/lib/domain/format";
import { CATEGORY_LABEL, ENGAGEMENT_TYPE_LABEL, WORK_MODE_LABEL } from "@/lib/domain/taxonomy";
import { MARKETING_SITE_URL } from "@/lib/domain/marketingSite";
import { ShareJobButtons } from "./share-job-buttons";

/**
 * Public job page — readable and shareable without an account, unlike the
 * apply page. Only ever shows an open + public opportunity (the same rows
 * opportunities_select RLS already exposes to anyone); anything else gets
 * a "no longer open" message rather than a hint that it exists.
 */
const loadJob = cache(async (id: string) => {
  const supabase = await createClient();
  const { data: job } = await supabase
    .from("opportunities")
    .select(
      "id, title, brief, category, skills, location, work_mode, engagement_type, payment_basis, compensation_amount, compensation_min, compensation_max, currency, application_deadline, number_of_openings, organisation_id"
    )
    .eq("id", id)
    .eq("status", "open")
    .eq("visibility", "public")
    .maybeSingle();
  if (!job) return null;
  const { data: org } = await supabase
    .from("public_organisation_names")
    .select("name, verification_status")
    .eq("id", job.organisation_id)
    .maybeSingle();
  return { job, org };
});

function isPastDeadline(deadline: string | null) {
  if (!deadline) return false;
  const end = new Date(deadline);
  end.setHours(23, 59, 59, 999);
  return end.getTime() < Date.now();
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const found = await loadJob(id);
  if (!found) return { title: "Job no longer open" };
  const { job, org } = found;
  const title = `${job.title}${org?.name ? ` — ${org.name}` : ""}`;
  const description = `${formatCompensation(job)} · ${(job.brief ?? "Paid opportunity on AdorWorks").slice(0, 160)}`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website", siteName: "AdorWorks" },
  };
}

export default async function PublicJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [found, session] = await Promise.all([loadJob(id), verifySession()]);
  const signedOut = !session;

  const header = signedOut && (
    <header className="border-b border-slate/15 bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
        <a href={MARKETING_SITE_URL} className="text-lg font-extrabold text-midnight">
          AdorWorks
        </a>
        <div className="flex items-center gap-4 text-sm font-semibold">
          <a href={`${MARKETING_SITE_URL}/jobs-projects.html`} className="text-slate hover:text-midnight">
            All jobs
          </a>
          <Link href={`/login?next=${encodeURIComponent(`/jobs/${id}`)}`} className="text-teal-ink">
            Sign in
          </Link>
        </div>
      </div>
    </header>
  );

  if (!found) {
    return (
      <div className="flex flex-1 flex-col bg-cloud">
        {header}
        <main className="mx-auto w-full max-w-3xl p-6 sm:p-8">
          <h1 className="text-2xl font-extrabold text-midnight">This job is no longer open</h1>
          <p className="mt-2 text-sm text-slate">It may have been filled or closed by the employer.</p>
          <a href={`${MARKETING_SITE_URL}/jobs-projects.html`} className="mt-4 inline-block font-semibold text-teal-ink underline">
            See the jobs that are open now
          </a>
        </main>
      </div>
    );
  }

  const { job, org } = found;
  const closed = isPastDeadline(job.application_deadline);
  const canApply = signedOut || session.role === "talent";
  const facts = [
    job.engagement_type && ENGAGEMENT_TYPE_LABEL[job.engagement_type],
    job.work_mode && WORK_MODE_LABEL[job.work_mode],
    job.category && CATEGORY_LABEL[job.category],
    job.number_of_openings && job.number_of_openings > 1 ? `${job.number_of_openings} openings` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-1 flex-col bg-cloud">
      {header}
      <main className="mx-auto w-full max-w-3xl p-6 sm:p-8">
        <article className="rounded-2xl border border-slate/15 bg-white p-6 sm:p-8">
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-slate">
            {org?.name ?? "AdorWorks employer"}
            {org?.verification_status === "verified" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-teal-ink/10 px-2 py-0.5 text-xs font-semibold text-teal-ink">
                <BadgeCheck className="size-3.5" aria-hidden="true" />
                Verified employer
              </span>
            )}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-midnight sm:text-3xl">{job.title}</h1>
          <p className="mt-2 text-lg font-bold text-teal-ink">{formatCompensation(job)}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {facts.map((fact) => (
              <span key={fact} className="rounded-full bg-cloud px-3 py-1 text-xs font-semibold text-midnight">
                {fact}
              </span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate">
            {job.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" aria-hidden="true" />
                {job.location}
              </span>
            )}
            {job.application_deadline && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="size-4" aria-hidden="true" />
                {closed ? "Applications closed" : `Apply by ${formatDate(job.application_deadline, { day: "numeric", month: "short", year: "numeric" })}`}
              </span>
            )}
          </div>

          {job.brief && (
            <section className="mt-6">
              <h2 className="text-sm font-bold tracking-wide text-slate uppercase">About the work</h2>
              <p className="mt-2 text-base whitespace-pre-line text-midnight">{job.brief}</p>
            </section>
          )}

          {(job.skills ?? []).length > 0 && (
            <section className="mt-6">
              <h2 className="text-sm font-bold tracking-wide text-slate uppercase">Skills needed</h2>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {(job.skills ?? []).map((skill) => (
                  <li key={skill} className="rounded-full bg-cloud px-3 py-1 text-sm text-slate">
                    {skill}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-8 flex flex-col gap-3 border-t border-slate/15 pt-6 sm:flex-row sm:items-center sm:justify-between">
            {closed ? (
              <p className="text-sm font-semibold text-slate">The deadline for this job has passed.</p>
            ) : canApply ? (
              <div>
                <Link
                  href={`/opportunities/${job.id}/apply`}
                  className="inline-flex w-full items-center justify-center rounded-lg bg-teal px-6 py-3 text-base font-bold text-midnight sm:w-auto"
                >
                  Apply for this job
                </Link>
                {signedOut && <p className="mt-2 text-xs text-slate">Free to apply — you&rsquo;ll sign in or create an account first.</p>}
              </div>
            ) : (
              <p className="text-sm text-slate">Signed in as an employer — talent accounts apply to jobs.</p>
            )}
            <ShareJobButtons title={job.title} path={`/jobs/${job.id}`} />
          </div>
        </article>
      </main>
    </div>
  );
}
