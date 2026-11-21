import type { Metadata } from "next";
import { requireRole } from "@/lib/dal/session";
import { getT } from "@/i18n/server";
import { CheckinForm } from "./checkin-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Check in to a session") };
}

/** Pathways session check-in (0123): scan the QR code or type the session code. */
export default async function CheckinPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  await requireRole("talent");
  const { code } = await searchParams;
  const t = await getT();
  return (
    <main className="mx-auto max-w-md p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">{t("Check in to a session")}</h1>
      <p className="mt-1 text-sm text-slate">{t("Enter the code your facilitator shows, or scan the QR code. Checking in also adds you to the programme.")}</p>
      <CheckinForm initialCode={(code ?? "").toUpperCase().slice(0, 24)} />
    </main>
  );
}
