import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { OrientationForm } from "./orientation-form";

export const metadata: Metadata = { title: "Trust & Safety orientation" };

/**
 * Free, never paywalled (master doc §22/§61 "Launch exclusions": charging
 * for required identity verification or essential Trust and Safety
 * learning is explicitly excluded from monetisation).
 */
export default async function TrustSafetyPage() {
  const session = await requireRole("talent");
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("talent_profiles")
    .select("safety_orientation_completed_at")
    .eq("id", session.userId)
    .maybeSingle();

  if (!profile) {
    return (
      <main className="mx-auto max-w-2xl p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold text-midnight">Trust &amp; Safety orientation</h1>
        <p className="mt-4 text-sm text-slate">
          Start{" "}
          <Link href="/onboarding" className="font-semibold text-teal-ink underline">
            onboarding
          </Link>{" "}
          first, then come back here.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">Trust &amp; Safety orientation</h1>
      <p className="mt-1 text-sm text-slate">
        A few things every AdorWorks talent should know before working with employers. Free, and never required
        as a paid step.
      </p>

      <div className="mt-6 space-y-4 rounded-xl border border-slate/15 bg-white p-5 text-sm text-slate">
        <div>
          <h2 className="font-bold text-midnight">Legitimate work never charges you</h2>
          <p className="mt-1">
            AdorWorks will never ask you to pay a fee to be considered for work, to unlock an opportunity, or to
            receive a payment. If anyone asks you to pay to get a job, report it — see below.
          </p>
        </div>
        <div>
          <h2 className="font-bold text-midnight">Protect your personal information</h2>
          <p className="mt-1">
            Be cautious about sharing your ID number, home address, or banking details outside AdorWorks&rsquo;
            own verification and payment steps. A genuine employer or AdorWorks staff member will never pressure
            you for this over chat or phone.
          </p>
        </div>
        <div>
          <h2 className="font-bold text-midnight">What verification tiers actually mean</h2>
          <p className="mt-1">
            A higher verification tier means AdorWorks has checked more evidence about you — it is not a
            guarantee of work, and no tier is required to browse or apply to opportunities.
          </p>
        </div>
        <div>
          <h2 className="font-bold text-midnight">Report anything that feels wrong</h2>
          <p className="mt-1">
            If an opportunity, message, or request feels unsafe, dishonest, or asks for money upfront, stop and
            contact AdorWorks staff through{" "}
            <Link href="/assistance/request" className="font-semibold text-teal-ink underline">
              Request help
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="mt-6">
        {profile.safety_orientation_completed_at ? (
          <p className="rounded-lg bg-teal/10 px-4 py-3 text-sm font-semibold text-teal-ink">
            Completed — thanks for reading through this.
          </p>
        ) : (
          <OrientationForm />
        )}
      </div>
    </main>
  );
}
