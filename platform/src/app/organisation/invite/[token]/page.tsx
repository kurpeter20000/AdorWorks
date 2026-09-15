import type { Metadata } from "next";
import Link from "next/link";
import { verifySession } from "@/lib/dal/session";
import { AcceptInviteButton } from "./accept-invite-button";

export const metadata: Metadata = { title: "Team invitation" };

export default async function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await verifySession();

  return (
    <main className="mx-auto max-w-md p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">Team invitation</h1>

      {session ? (
        <div className="mt-4">
          <p className="text-sm text-slate">
            You&rsquo;re signed in as <strong>{session.email}</strong>. If that&rsquo;s the address this invitation was
            sent to, accept it below.
          </p>
          <AcceptInviteButton token={token} />
        </div>
      ) : (
        <div className="mt-4 space-y-3 text-sm text-slate">
          <p>Sign in (or create an account) with the email address this invitation was sent to, then come back to this link to accept it.</p>
          <div className="flex gap-3">
            <Link href="/login" className="rounded-lg bg-midnight px-4 py-2 font-semibold text-white">
              Log in
            </Link>
            <Link href="/signup" className="rounded-lg border border-slate/25 px-4 py-2 font-semibold text-midnight">
              Create an account
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
