"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { logoutDueToIdle } from "@/lib/actions/auth";
import { useT } from "@/i18n/client";

// 10 minutes with no mouse/keyboard/touch activity signs someone out —
// a real session on a shared/public computer left unattended shouldn't
// stay signed in indefinitely. This is a *client-side* idle timer: it
// tracks actual in-page interaction, unlike proxy.ts's own inactivity
// check (same 10-minute limit, kept in sync — see that file's own
// comment), which only ever runs on a new request and so can't detect
// someone sitting idle on an already-loaded page.
const IDLE_LIMIT_MS = 10 * 60 * 1000;
// A plain, silent sign-out at the 10-minute mark would be jarring for
// anyone who stepped away mid-task — this warns for the last minute of
// that window, with a one-click way to stay signed in, rather than
// springing a logged-out screen on someone without notice.
const WARNING_BEFORE_MS = 60 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "wheel", "scroll"] as const;

/**
 * Mounted once in AppShellClient (every authenticated page). Renders
 * nothing until the warning window, then a dismissible countdown banner;
 * on expiry, calls the idle-specific logout action directly (a Server
 * Action invoked as a plain async function from a client event handler —
 * same supported pattern as a form action, just not inside a <form>).
 */
export function IdleTimer() {
  const t = useT();
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  // 0, not Date.now() — reading the clock is an impure call React
  // disallows during render (including this lazy ref init); the real
  // start time is stamped once the effect below actually runs.
  const lastActiveRef = useRef(0);
  const [, startTransition] = useTransition();

  const resetActivity = useCallback(() => {
    lastActiveRef.current = Date.now();
    setSecondsLeft((prev) => (prev !== null ? null : prev));
  }, []);

  useEffect(() => {
    // Only the ref, not resetActivity() — secondsLeft is already null on
    // mount, and setting state synchronously in an effect body (rather
    // than in response to a real external event, like the listeners
    // below do) is the exact cascading-render pattern React's own lint
    // rules flag.
    lastActiveRef.current = Date.now();
    // Throttled via the timestamp check below rather than a separate
    // debounce wrapper — mousemove alone can fire dozens of times a
    // second, and resetActivity() is cheap enough (one ref write, one
    // state update only when the warning is already showing) that a
    // light "ignore anything within the last second" guard is enough to
    // keep this from doing real work on every single event.
    let lastReset = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastReset < 1000) return;
      lastReset = now;
      resetActivity();
    };
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));

    const interval = setInterval(() => {
      const elapsed = Date.now() - lastActiveRef.current;
      if (elapsed >= IDLE_LIMIT_MS) {
        startTransition(() => {
          logoutDueToIdle();
        });
        return;
      }
      if (elapsed >= IDLE_LIMIT_MS - WARNING_BEFORE_MS) {
        setSecondsLeft(Math.max(0, Math.ceil((IDLE_LIMIT_MS - elapsed) / 1000)));
      } else {
        setSecondsLeft(null);
      }
    }, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, onActivity));
      clearInterval(interval);
    };
  }, [resetActivity]);

  if (secondsLeft === null) return null;

  return (
    <div
      role="alertdialog"
      aria-label={t("Still there?")}
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-xl border border-coral/30 bg-white px-4 py-3 shadow-lg sm:inset-x-auto sm:end-4"
    >
      <p className="text-sm text-midnight">
        {t("You'll be signed out in {n}s due to inactivity.", { n: secondsLeft })}
      </p>
      <button
        type="button"
        onClick={resetActivity}
        className="shrink-0 rounded-lg bg-teal px-3 py-1.5 text-sm font-bold text-midnight"
      >
        {t("Stay signed in")}
      </button>
    </div>
  );
}
