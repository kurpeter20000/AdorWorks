import type { Metadata } from "next";
import Link from "next/link";
import { resolveReturnPath } from "@/lib/domain/redirects";
import { getT } from "@/i18n/server";
import { PhoneForm } from "./phone-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Continue with your phone") };
}

/** Phone sign-in / sign-up (0122): no email needed. */
export default async function PhonePage({ searchParams }: { searchParams: Promise<{ mode?: string; intent?: string; next?: string; phone?: string }> }) {
  const { mode: rawMode, intent: rawIntent, next, phone } = await searchParams;
  const t = await getT();
  const mode = rawMode === "signup" ? "signup" : "signin";
  const intent = rawIntent === "hire" ? "hire" : "talent";
  const returnTo = resolveReturnPath(next);

  return (
    <div>
      <h1 className="text-[2.25rem] leading-tight font-extrabold text-midnight">{mode === "signup" ? t("Create your account") : t("Welcome back")}</h1>
      <p className="mt-1.5 text-[#4a5263]">{t("Use your phone number — we'll text you a code. No email needed.")}</p>
      <PhoneForm mode={mode} intent={intent} next={returnTo} defaultPhone={/^\+?[0-9 ]{9,16}$/.test(phone ?? "") ? phone : undefined} />
      <p className="mt-5 text-center text-[#4a5263]">
        {mode === "signup" ? t("Already have an account?") : t("New to AdorWorks?")}{" "}
        <Link href={mode === "signup" ? "/phone?mode=signin" : `/phone?mode=signup&intent=${intent}`} prefetch={false} className="font-extrabold text-teal-ink hover:underline">
          {mode === "signup" ? t("Sign in") : t("Create a free account")}
        </Link>
      </p>
    </div>
  );
}
