"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { LOCALES, LOCALE_LABEL } from "@/i18n/config";
import { useLocale, useT } from "@/i18n/client";
import { setLocale } from "@/lib/actions/locale";

/** English / العربية / Kiswahili — saves the choice, then re-renders the page in it. */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const locale = useLocale();
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className={`items-center gap-1.5 text-sm text-slate ${className.includes("hidden") || className.includes("flex") ? className : `inline-flex ${className}`}`}>
      <Languages className="size-4 shrink-0" aria-hidden="true" />
      <span className="sr-only">{t("Language")}</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(async () => {
            await setLocale(next);
            router.refresh();
          });
        }}
        className="rounded-lg border border-slate/20 bg-white px-2 py-1.5 text-sm font-semibold text-midnight focus:border-teal focus:outline-none"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_LABEL[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
