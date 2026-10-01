import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, translate, type Locale, type Messages, type Translate } from "./config";
import ar from "./messages/ar.json";
import sw from "./messages/sw.json";

const MESSAGES: Record<Locale, Messages> = { en: {}, ar, sw };

/** The visitor's language: their saved choice (cookie), else English. */
export const getLocale = cache(async (): Promise<Locale> => {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(saved) ? saved : DEFAULT_LOCALE;
});

export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale];
}

/** For Server Components, Server Actions and metadata: `const t = await getT(); t("Find work")`. */
export const getT = cache(async (): Promise<Translate> => {
  const messages = getMessages(await getLocale());
  return (english, vars) => translate(messages, english, vars);
});
