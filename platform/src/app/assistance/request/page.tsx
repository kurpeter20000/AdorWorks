import type { Metadata } from "next";
import { verifySession } from "@/lib/dal/session";
import { RequestForm } from "./request-form";

export const metadata: Metadata = { title: "Request help" };

export default async function AssistanceRequestPage() {
  // No requireSession() here on purpose — this must be reachable by
  // someone with no AdorWorks account at all, at a partner hub.
  const session = await verifySession();

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">Request in-person help</h1>
      <p className="mt-2 text-sm text-slate">
        If you&rsquo;d rather have someone help you finish your AdorWorks profile in person —
        at a partner cybercafe, school or NGO office — tell us briefly why, and AdorWorks
        staff will arrange it.
      </p>
      {session && (
        <p className="mt-2 text-xs text-slate">
          Signed in as {session.email} — this request will be linked to your account.
        </p>
      )}
      <RequestForm />
    </main>
  );
}
