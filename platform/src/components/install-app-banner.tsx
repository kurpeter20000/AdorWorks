"use client";

import { useState, useSyncExternalStore } from "react";

const DISMISSED_KEY = "adorworks-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Module-level, not component state: the event can only ever be fired once
// per page load, well before or after this component happens to mount.
let capturedPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function subscribeToInstallPrompt(callback: () => void) {
  function handler(e: Event) {
    e.preventDefault();
    capturedPrompt = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  }
  window.addEventListener("beforeinstallprompt", handler);
  listeners.add(callback);
  return () => {
    window.removeEventListener("beforeinstallprompt", handler);
    listeners.delete(callback);
  };
}

function getInstallPromptSnapshot() {
  return capturedPrompt;
}

function getServerInstallPromptSnapshot() {
  return null;
}

// Same "isClient" trick as elsewhere (see ConnectivityBanner) instead of
// useEffect(() => setState(true)) — useSyncExternalStore is explicitly
// allowed to differ between the server snapshot and the client's first
// read, which is exactly what's needed to read navigator/localStorage
// safely without a synchronous setState-in-effect.
function subscribeNoop() {
  return () => {};
}
function getMountedSnapshot() {
  return true;
}
function getServerMountedSnapshot() {
  return false;
}

/**
 * Chrome/Edge only fire beforeinstallprompt after their own engagement
 * heuristics are met, and even then only show a subtle address-bar icon
 * unless something calls .prompt() itself — easy to miss entirely on a
 * short visit from an emailed link (confirm/reset), which is exactly when
 * people land here. This makes installing an explicit, visible action
 * instead of relying on the browser's own quiet prompt. iOS Safari has no
 * programmatic install prompt at all, so it gets instructions instead.
 */
export function InstallAppBanner() {
  const mounted = useSyncExternalStore(subscribeNoop, getMountedSnapshot, getServerMountedSnapshot);
  const deferredPrompt = useSyncExternalStore(
    subscribeToInstallPrompt,
    getInstallPromptSnapshot,
    getServerInstallPromptSnapshot
  );
  const [dismissed, setDismissed] = useState(false);

  if (!mounted) return null;

  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);

  if (standalone || dismissed || localStorage.getItem(DISMISSED_KEY) === "1") return null;
  if (!ios && !deferredPrompt) return null;

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    capturedPrompt = null;
    dismiss();
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-midnight px-4 py-2.5 text-sm text-white">
      {ios ? (
        <p className="m-0">
          Install AdorWorks: tap <span className="font-semibold">Share</span>, then{" "}
          <span className="font-semibold">Add to Home Screen</span>.
        </p>
      ) : (
        <p className="m-0">Install the AdorWorks app for quicker access.</p>
      )}
      <div className="flex items-center gap-3">
        {!ios && (
          <button
            type="button"
            onClick={install}
            className="rounded-lg bg-teal px-3 py-1.5 text-xs font-bold text-midnight"
          >
            Install
          </button>
        )}
        <button type="button" onClick={dismiss} className="text-xs font-semibold text-white/70 hover:text-white">
          Dismiss
        </button>
      </div>
    </div>
  );
}
