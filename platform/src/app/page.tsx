import Link from "next/link";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal/session";
import { MARKETING_SITE_URL } from "@/lib/domain/marketingSite";
import { HeroVideoBackground } from "@/components/hero-video-background";
import { HashRedirectGuard } from "./hash-redirect-guard";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  if (code) {
    // Supabase's password-reset and signup-confirmation emails are sent
    // with redirectTo=/auth/callback, but land here with a bare ?code=
    // instead whenever that exact URL isn't in the Supabase project's
    // Redirect URLs allowlist — GoTrue silently falls back to the
    // project's bare Site URL rather than erroring, dropping the
    // original ?next= along with it. Forward just the code and let
    // /auth/callback's own fallback figure out where this particular
    // user actually belongs, rather than assuming reset-password here.
    redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  }

  const session = await verifySession();
  if (session && session.status === "active") {
    redirect("/dashboard");
  }

  return (
    <main className="relative isolate flex flex-1 flex-col items-center justify-center overflow-hidden p-8 text-center">
      <HashRedirectGuard />
      <HeroVideoBackground className="absolute inset-0 -z-20 h-full w-full object-cover" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-midnight/80 to-midnight/90" />

      <p className="text-sm font-semibold tracking-wide text-teal uppercase">AdorWorks Platform</p>
      <h1 className="mt-3 max-w-2xl text-4xl font-extrabold text-white sm:text-5xl">Talent found. Work delivered.</h1>
      <p className="mt-4 max-w-lg text-white/80">Sign in to your account or create a new one to get started.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/login" className="rounded-lg bg-teal px-6 py-3 text-sm font-bold text-midnight hover:bg-accent-hover">
          Sign in
        </Link>
        <Link
          href="/signup"
          className="rounded-lg border-2 border-white/70 px-6 py-3 text-sm font-bold text-white hover:bg-white/10"
        >
          Create an account
        </Link>
      </div>
      <a href={MARKETING_SITE_URL} className="mt-8 text-sm font-semibold text-white/70 hover:text-white">
        &larr; Back to the AdorWorks website
      </a>
    </main>
  );
}
