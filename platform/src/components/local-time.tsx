"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * A time shown in the viewer's own timezone, with the zone named (spec:
 * "both sides see the same time in their own timezone"). The server
 * doesn't know the viewer's zone, so it renders the UTC time and the
 * browser swaps in the local one.
 */
export function LocalTime({ iso, className }: { iso: string; className?: string }) {
  const local = useSyncExternalStore(
    noop,
    () => format(iso, undefined, undefined),
    // The server and the first browser render must match exactly, so
    // both use a fixed locale and UTC; then the browser's own takes over.
    () => format(iso, "en-GB", "UTC")
  );
  return (
    <time dateTime={iso} className={className}>
      {local}
    </time>
  );
}

function format(iso: string, locale: string | undefined, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone,
  }).format(new Date(iso));
}
