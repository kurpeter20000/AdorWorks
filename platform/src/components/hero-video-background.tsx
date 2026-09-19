"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

const POSTER_URL = "/hero/hero-poster.jpg";

// Standard "has this hydrated yet" flag via useSyncExternalStore rather
// than the classic `useEffect(() => setMounted(true), [])` — that pattern
// trips react-hooks/set-state-in-effect (a setState call synchronous in
// an effect body), and this is the pattern React's own docs point to
// instead: false on the server and on the client's first render (so they
// match, no hydration mismatch), true from the next render once mounted.
const subscribeNever = () => () => {};
function useMounted(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );
}

/**
 * Same asset and the same autoplay gating as the marketing site's hero
 * video (see ../../js/main.js and css/styles.css .hero-photo) — decorative
 * only (muted, looping, no controls), skipped on narrow screens, reduced-
 * motion, or a Data Saver connection. The `poster` frame is the fallback
 * in every one of those cases, so autoplay staying off never leaves the
 * background blank.
 *
 * The real <video> only mounts after hydration (see `mounted` below). A
 * `<video poster>` attribute is eagerly fetched by the browser's preload
 * scanner the instant it appears in the HTML, on every page that renders
 * this component (home, login, signup, forgot/reset-password) — competing
 * for the same limited early connections as render-critical CSS/JS on
 * pages whose own content (a login form's heading, for example) has
 * nothing to do with this decorative background. A plain CSS
 * background-image isn't an LCP candidate at all and isn't discovered by
 * the preload scanner the same way, so it renders the identical frame
 * without joining that competition — then the real <video> takes over
 * once the page is already interactive.
 */
export function HeroVideoBackground({ className }: { className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mounted = useMounted();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    const saveData = Boolean(nav.connection?.saveData);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wideEnough = window.matchMedia("(min-width: 768px)").matches;

    if (wideEnough && !reduceMotion && !saveData) {
      video.muted = true;
      video.play().catch(() => {
        // Autoplay blocked by the browser — poster frame stays visible.
      });
    }
  }, [mounted]);

  if (!mounted) {
    return (
      <div
        className={className ?? "absolute inset-0 h-full w-full object-cover"}
        style={{ backgroundImage: `url(${POSTER_URL})`, backgroundSize: "cover", backgroundPosition: "center" }}
        aria-hidden="true"
      />
    );
  }

  return (
    <video
      ref={videoRef}
      className={className ?? "absolute inset-0 h-full w-full object-cover"}
      poster={POSTER_URL}
      muted
      loop
      playsInline
      preload="none"
      aria-hidden="true"
    >
      <source src="/hero/hero-720.mp4" type="video/mp4" media="(max-width: 767px)" />
      <source src="/hero/hero-1080.mp4" type="video/mp4" />
    </video>
  );
}
