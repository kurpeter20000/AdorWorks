import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMyOrganisationMembership } from "@/lib/dal/organisation";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Set up your organisation" };

export default async function OrganisationSetupPage() {
  const membership = await getMyOrganisationMembership();

  if (membership) {
    redirect("/organisation");
  }

  return (
    <main className="mx-auto max-w-xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">Set up your organisation</h1>
      <p className="mt-2 text-sm text-slate">
        This is the business or account that owns the opportunities you post. AdorWorks staff
        review new organisations and opportunities before they go live — you can post your first
        opportunity right after this step.
      </p>
      <SetupForm />
    </main>
  );
}
