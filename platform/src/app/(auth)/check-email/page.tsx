import type { Metadata } from "next";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Check your email") };
}

export default async function CheckEmailPage() {
  const t = await getT();
  return (
    <div className="text-center">
      <h1 className="text-2xl font-bold text-midnight">{t("Check your email")}</h1>
      <p className="mt-3 text-sm text-slate">
        {t("We've sent a link to verify your email address. This confirms we can reach you at that address — it doesn't verify your identity; that's a separate step later in your profile.")}
      </p>
      <p className="mt-3 text-sm text-slate">
        {t("Didn't get it? Check spam, or wait a minute and try signing in — you can request another link from there.")}
      </p>
    </div>
  );
}
