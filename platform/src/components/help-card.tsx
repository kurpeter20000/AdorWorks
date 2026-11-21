import Link from "next/link";
import { getT } from "@/i18n/server";

/** Spec "Help card": Message support, In-person help, Trust & Safety — on every home screen. */
export async function HelpCard({ audience }: { audience: "talent" | "employer" }) {
  const t = await getT();
  return (
    <section aria-labelledby="help-card-title" className="rounded-card bg-midnight p-5 text-white">
      <h2 id="help-card-title" className="text-base font-extrabold">
        {audience === "employer" ? t("Need a hand hiring?") : t("Stuck on something?")}
      </h2>
      <p className="mt-1 text-sm text-white/75">
        {audience === "employer"
          ? t("Message our team, or book someone to help you in person.")
          : t("Message our team, or ask someone to help you in person. No question is too small.")}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/support" className="inline-flex min-h-11 items-center rounded-control bg-white px-4 text-sm font-extrabold text-midnight hover:bg-cloud">
          {t("Message support")}
        </Link>
        <Link href="/assistance/request" className="inline-flex min-h-11 items-center rounded-control border border-white/30 px-4 text-sm font-bold text-white hover:bg-white/10">
          {t("In-person help")}
        </Link>
        {audience === "talent" && (
          <Link href="/trust-safety" className="inline-flex min-h-11 items-center rounded-control border border-white/30 px-4 text-sm font-bold text-white hover:bg-white/10">
            {t("Trust & Safety")}
          </Link>
        )}
      </div>
    </section>
  );
}
