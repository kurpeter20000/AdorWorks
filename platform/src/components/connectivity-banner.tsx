"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/**
 * AdorWorks' marketplace app is deliberately online-only, not offline-first
 * — every core action (messaging, payments, contract state changes) has to
 * reach the server to mean anything, so a full offline queue/sync layer
 * would let people fill out forms that then fail anyway. This is the
 * scoped-down, honest version: tell people plainly when they've lost
 * connectivity, so a failed submit reads as "you're offline" instead of a
 * confusing generic error.
 */
export function ConnectivityBanner() {
  // useSyncExternalStore (not useState+useEffect) — navigator.onLine is
  // genuinely external browser state being subscribed to, and the server
  // snapshot has to assume "online" since navigator doesn't exist there.
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true
  );

  if (online) return null;

  return (
    <div role="status" className="bg-coral px-4 py-2 text-center text-sm font-semibold text-white">
      You&rsquo;re offline — actions like sending messages or updating a contract won&rsquo;t go through until your
      connection comes back.
    </div>
  );
}
