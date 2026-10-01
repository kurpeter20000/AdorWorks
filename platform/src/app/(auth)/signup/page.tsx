import type { Metadata } from "next";
import Link from "next/link";
import { resolveReturnPath } from "@/lib/domain/redirects";
import { SignupForm } from "./signup-form";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Create your account") };
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string; next?: string }>;
}) {
  const { intent, next } = await searchParams;
  const returnTo = resolveReturnPath(next);
  const defaultIntent = intent === "hire" ? "hire" : "talent";
  const t = await getT();

  return (
    <div>
      <h1 className="text-2xl font-bold text-midnight">{t("Create your account")}</h1>
      <p className="mt-1 text-sm text-slate">
        {t("Free to register, always. We'll never charge you to be considered for work.")}
      </p>
      <SignupForm defaultIntent={defaultIntent} next={returnTo} />
      <p className="mt-4 text-center text-sm text-slate">
        {t("Already have an account?")}{" "}
        {/* prefetch off — see the matching comment in ../login/page.tsx (S12-12) */}
        <Link href={returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login"} prefetch={false} className="font-semibold text-teal-ink">
          {t("Sign in")}
        </Link>
      </p>
    </div>
  );
}
