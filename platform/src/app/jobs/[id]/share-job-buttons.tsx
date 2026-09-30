"use client";

import { useState } from "react";
import { Link2, MessageCircle } from "lucide-react";

/** WhatsApp is how most listings will actually travel, so it gets its own button. */
export function ShareJobButtons({ title, path }: { title: string; path: string }) {
  const [copied, setCopied] = useState(false);

  function url() {
    return `${window.location.origin}${path}`;
  }

  function whatsapp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${title} — ${url()}`)}`, "_blank", "noopener,noreferrer");
  }

  function copy() {
    navigator.clipboard
      .writeText(url())
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        /* clipboard can be unavailable (insecure context, permissions) */
      });
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={whatsapp}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate/25 px-3 py-2 text-sm font-semibold text-midnight hover:border-teal"
      >
        <MessageCircle className="size-4" aria-hidden="true" />
        Share on WhatsApp
      </button>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate/25 px-3 py-2 text-sm font-semibold text-midnight hover:border-teal"
      >
        <Link2 className="size-4" aria-hidden="true" />
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
