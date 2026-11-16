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
    () => format(iso, undefined),
    () => format(iso, "UTC")
  );
  return (
    <time dateTime={iso} className={className}>
      {local}
    </time>
  );
}

function format(iso: string, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone,
  }).format(new Date(iso));
}
