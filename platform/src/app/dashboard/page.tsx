import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/dal/session";
import { logout } from "@/lib/actions/auth";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await requireSession();

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

      {session.role === "talent" && (
        <div className="mt-8 rounded-xl border border-teal/30 bg-teal/5 p-5">
          <h2 className="font-bold text-midnight">Finish your profile</h2>
          <p className="mt-1 text-sm text-slate">
            Complete your profile and request verification so employers can find and shortlist you.
          </p>
          <Link
            href="/onboarding"
            className="mt-3 inline-block rounded-lg bg-teal px-4 py-2 text-sm font-bold text-midnight"
          >
            Continue onboarding
          </Link>
        </div>
      )}

      {session.role === "individual_client" && (
        <div className="mt-8 rounded-xl border border-violet/30 bg-violet/5 p-5">
          <h2 className="font-bold text-midnight">Hiring on AdorWorks</h2>
          <p className="mt-1 text-sm text-slate">
            Set up an organisation to post paid opportunities and build a shortlist.
          </p>
          <Link
            href="/organisation"
            className="mt-3 inline-block rounded-lg bg-violet px-4 py-2 text-sm font-bold text-white"
          >
            Go to your organisation
          </Link>
        </div>
      )}
    </main>
  );
}
