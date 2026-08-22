import type { Metadata } from "next";

export const metadata: Metadata = { title: "Check your email" };

export default function CheckEmailPage() {
  return (
    <div className="text-center">
      <h1 className="text-xl font-bold text-midnight">Check your email</h1>
      <p className="mt-3 text-sm text-slate">
        We&apos;ve sent a link to verify your email address. This confirms we
        can reach you at that address — it doesn&apos;t verify your identity;
        that&apos;s a separate step later in your profile.
      </p>
      <p className="mt-3 text-sm text-slate">
        Didn&apos;t get it? Check spam, or wait a minute and try signing in —
        you can request another link from there.
      </p>
    </div>
  );
}
