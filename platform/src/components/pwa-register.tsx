"use client";

import { useEffect } from "react";

/** Registers the minimal static-asset service worker (see public/sw.js) so the app is installable. Silently no-ops where unsupported. */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return null;
}
