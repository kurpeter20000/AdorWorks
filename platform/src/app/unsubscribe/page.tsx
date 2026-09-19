import type { Metadata } from "next";
import { verifyUnsubscribeToken } from "@/lib/unsubscribeToken";
import { UnsubscribeConfirmForm } from "./unsubscribe-confirm-form";

export const metadata: Metadata = { title: "Unsubscribe" };

/**
 * S11-08 — reached from the link in every AdorWorks email footer
 * (lib/emailTemplate.ts). No session required by design: verified via
 * the signed token in the URL (lib/unsubscribeToken.ts), not requireSession.
 */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ u?: string; t?: string }> }) {
  const { u, t } = await searchParams;
  const valid = !!u && !!t && verifyUnsubscribeToken(u, t);

  return (
    <main className="mx-auto max-w-md p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">Email preferences</h1>
      {valid ? (
        <UnsubscribeConfirmForm userId={u} token={t} />
      ) : (
        <p className="mt-4 text-sm text-slate">
          This link is invalid or has already been used. If you&rsquo;re signed in, you can change your email
          preferences from the Notifications page instead.
        </p>
      )}
    </main>
  );
}
