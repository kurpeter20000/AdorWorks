"use client";

import { useT } from "@/i18n/client";
import { ActionList, type ActionItem } from "./action-list";

/**
 * Stage 8: the employer dashboard's hiring-priorities surface. Every
 * count comes from a real query in dashboard/page.tsx, scoped to the
 * employer's own organisation — nothing invented, nothing cross-org.
 */
export function EmployerPipelineSummary({ items }: { items: ActionItem[] }) {
  const t = useT();
  return <ActionList items={items} emptyMessage={t("Nothing waiting on you right now — your pipeline is caught up.")} />;
}
