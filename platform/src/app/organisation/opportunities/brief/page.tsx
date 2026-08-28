import type { Metadata } from "next";
import Link from "next/link";
import { requireOrganisationMembership } from "@/lib/dal/organisation";
import { ProjectBriefForm } from "./project-brief-form";

export const metadata: Metadata = { title: "Quick project brief" };

/**
 * The shorter, outcome-first counterpart to the Role Canvas wizard at
 * /organisation/opportunities/new — see createProjectBrief for why this
 * still lands in the same opportunities pipeline rather than a separate
 * one.
 */
export default async function ProjectBriefPage() {
  const { org } = await requireOrganisationMembership();

  return (
    <main className="mx-auto max-w-xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">Quick project brief</h1>
      <p className="mt-2 text-sm text-slate">
        Don&rsquo;t know all the details yet? Describe the outcome you want and we&rsquo;ll save it as a draft —
        you can fill in the rest (or ask AdorWorks staff to help) before it goes to review. Prefer to fill
        everything in now? Use the{" "}
        <Link href="/organisation/opportunities/new" className="font-semibold text-teal-ink underline">
          full Role Canvas
        </Link>{" "}
        instead.
      </p>
      <ProjectBriefForm organisationId={org.id} />
    </main>
  );
}
