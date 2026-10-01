"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { DEFAULT_LOCALE, translate, type Locale, type Messages, type Translate } from "./config";

const I18nContext = createContext<{ locale: Locale; messages: Messages }>({ locale: DEFAULT_LOCALE, messages: {} });

/** Set once in the root layout with the current language's messages only. */
export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: ReactNode }) {
  return <I18nContext.Provider value={{ locale, messages }}>{children}</I18nContext.Provider>;
}

/** For Client Components: `const t = useT(); t("Find work")`. */
export function useT(): Translate {
  const { messages } = useContext(I18nContext);
  return useCallback<Translate>((english, vars) => translate(messages, english, vars), [messages]);
}

export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}
