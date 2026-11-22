"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";

/**
 * A description that starts at a few lines and opens in place, so no
 * sentence is silently cut off (owner, Nov 2026 — the same "tap for more"
 * the public jobs page uses). The "Show more" button only appears when
 * the text really is longer than the preview.
 */
export function ExpandableText({ text, lines = 3, className = "" }: { text: string; lines?: 2 | 3 | 4; className?: string }) {
  const t = useT();
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const clamp = lines === 2 ? "line-clamp-2" : lines === 4 ? "line-clamp-4" : "line-clamp-3";

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  return (
    <div className={className}>
      <p ref={ref} className={`text-pretty whitespace-pre-line ${open ? "" : clamp}`}>
        {text}
      </p>
      {(overflows || open) && (
        <button
          type="button"
          aria-expanded={open}
          onClick={(e) => {
            // Inside a clickable card: open the text, not the card.
            e.preventDefault();
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="mt-1 min-h-8 text-xs font-bold text-teal-ink underline-offset-2 hover:underline"
        >
          {open ? t("Show less") : t("Show more")}
        </button>
      )}
    </div>
  );
}
