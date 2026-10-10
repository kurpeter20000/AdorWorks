"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { logout } from "@/lib/actions/auth";
import { useT } from "@/i18n/client";

/**
 * Header avatar — click to see who you're signed in as and jump to
 * editing your profile/org, without needing to open the sidebar drawer
 * first (the only other place that info lived). No avatar image yet
 * (talent hasn't uploaded a photo / org has no logo) falls back to an
 * initial, same idea as most account menus elsewhere.
 */
export function AccountMenu({
  displayName,
  avatarUrl,
  profileHref,
  profileLabel,
}: {
  displayName: string;
  avatarUrl: string | null;
  profileHref: string | null;
  profileLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const t = useT();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const initial = displayName.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("Account menu")}
        aria-expanded={open}
        aria-haspopup="menu"
        className="relative size-9 shrink-0 overflow-hidden rounded-full border border-slate/20 bg-cloud"
      >
        {avatarUrl ? (
          <Image src={avatarUrl} alt="" fill sizes="36px" className="object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-xs font-bold text-midnight">{initial}</span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full z-40 mt-2 w-56 rounded-lg border border-slate/15 bg-white py-2 shadow-lg"
        >
          <p className="truncate border-b border-slate/10 px-3 pb-2 text-sm font-semibold text-midnight" title={displayName}>
            {displayName}
          </p>
          {profileHref && (
            <Link
              href={profileHref}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm text-midnight hover:bg-cloud"
            >
              {profileLabel}
            </Link>
          )}
          <form action={logout}>
            <button type="submit" role="menuitem" className="block w-full px-3 py-2 text-start text-sm text-coral-ink hover:bg-cloud">
              {t("Sign out")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
