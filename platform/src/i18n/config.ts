/**
 * App translations (English / Arabic / Swahili).
 *
 * Text is looked up by its English wording — `t("Find work")` — so the
 * English source stays readable in the code and a missing translation
 * simply shows English. Translators edit i18n/app.csv at the repo root;
 * tools/i18n/build-dictionaries.mjs writes ./messages/{ar,sw}.json from it
 * and tools/i18n/extract-app-strings.mjs adds every t("…") it finds here.
 *
 * Placeholders: t("{n} new", { n: 3 }) → "3 new". Translators keep the {n}.
 */
export const LOCALES = ["en", "ar", "sw"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Same cookie name the public website uses for its own choice (aw_lang). */
export const LOCALE_COOKIE = "aw_lang";

export const LOCALE_LABEL: Record<Locale, string> = { en: "English", ar: "العربية", sw: "Kiswahili" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function dirOf(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

export type Messages = Record<string, string>;
export type TranslateVars = Record<string, string | number>;
export type Translate = (english: string, vars?: TranslateVars) => string;

/**
 * Marks English text that's stored in a constant (menu labels, status
 * names) and translated later where it's shown with t(label). Returns the
 * text unchanged; it exists so tools/i18n/extract-app-strings.mjs can find it.
 */
export const msg = (english: string) => english;

export function translate(messages: Messages, english: string, vars?: TranslateVars): string {
  const text = messages[english] || english;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}
