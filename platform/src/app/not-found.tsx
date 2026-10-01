import Link from "next/link";
import { StatePanel } from "@/components/state-panel";
import { getT } from "@/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return (
    <main className="mx-auto max-w-2xl p-8">
      <StatePanel title={t("Page not found")}>
        <p>{t("The page may have moved, or your account may not have access to it.")}</p>
        <Link href="/dashboard" className="mt-4 inline-block font-semibold text-teal-ink underline">
          {t("Return to your dashboard")}
        </Link>
      </StatePanel>
    </main>
  );
}
