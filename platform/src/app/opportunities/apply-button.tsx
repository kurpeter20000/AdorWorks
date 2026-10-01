"use client";

import Link from "next/link";
import { useT } from "@/i18n/client";

export function ApplyButton({
  opportunityId,
  alreadyApplied,
}: {
  opportunityId: string;
  alreadyApplied: boolean;
}) {
  const t = useT();
  if (alreadyApplied) {
    return <span className="text-xs font-semibold text-slate">{t("Applied")}</span>;
  }

  return (
    <Link
      href={`/opportunities/${opportunityId}/apply`}
      className="rounded-lg bg-teal px-3 py-1.5 text-sm font-bold text-midnight"
    >
      {t("Apply")}
    </Link>
  );
}
