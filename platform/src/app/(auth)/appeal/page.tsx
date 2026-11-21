import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { AppealForm } from "./appeal-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Appeal a suspension") };
}

/** Public: a suspended account can't sign in, so the appeal starts here (0112). */
export default async function AppealPage() {
  const t = await getT();
  return (
    <div>
      <h1 className="text-2xl font-bold text-midnight">{t("Appeal a suspension")}</h1>
      <p className="mt-2 text-sm text-slate">
        {t("If your account was suspended and you think it's a mistake, tell us why. Our Trust & Safety team reviews every appeal and emails you the outcome.")}
      </p>
      <AppealForm />
    </div>
  );
}
