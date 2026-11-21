import type { Metadata } from "next";
import { requireRole } from "@/lib/dal/session";
import { getT } from "@/i18n/server";
import { JoinForm } from "./join-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Join a programme") };
}

/** Pathways enrolment by code (0122). Free to young people, always. */
export default async function JoinProgrammePage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  await requireRole("talent");
  const { code } = await searchParams;
  const t = await getT();
  return (
    <main className="mx-auto max-w-md p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">{t("Join a programme")}</h1>
      <p className="mt-1 text-sm text-slate">{t("Enter the code from your Pathways session. Joining is free — AdorWorks never charges participants.")}</p>
      <JoinForm initialCode={(code ?? "").toUpperCase().slice(0, 20)} />
      <p className="mt-4 text-xs text-slate">
        {t("Your programme partner sees group results only. They see your name and progress only if you agree, which you can choose under Programme sharing.")}
      </p>
    </main>
  );
}
