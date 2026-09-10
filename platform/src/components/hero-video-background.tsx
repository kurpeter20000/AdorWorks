"use client";

import { useEffect, useRef } from "react";

/**
 * Same asset and the same autoplay gating as the marketing site's hero
 * video (see ../../js/main.js and css/styles.css .hero-photo) — decorative
 * only (muted, looping, no controls), skipped on narrow screens, reduced-
 * motion, or a Data Saver connection. The `poster` frame is the fallback
 * in every one of those cases, so autoplay staying off never leaves the
 * background blank.
 */
export function HeroVideoBackground({ className }: { className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

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
  }, []);

  return (
    <video
      ref={videoRef}
      className={className ?? "absolute inset-0 h-full w-full object-cover"}
      poster="/hero/hero-poster.jpg"
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
