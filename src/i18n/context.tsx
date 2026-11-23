"use client";

import { createContext, useCallback, useContext, useMemo, useTransition } from "react";
import type { Direction, Locale } from "@/types";
import { LOCALES } from "@/types";
import { setLocaleAction } from "@/app/actions/locale";
import type { Dictionary } from "./en";
import { getDictionary } from "./index";

interface I18nContextValue {
  locale: Locale;
  direction: Direction;
  t: Dictionary;
  setLocale: (locale: Locale) => void;
  switching: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/** The locale comes from a cookie read on the server, so the first render is already correct. */
export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const [switching, startTransition] = useTransition();
  const setLocale = useCallback((next: Locale) => {
    startTransition(() => setLocaleAction(next));
  }, []);

  const value = useMemo(
    () => ({ locale, direction: LOCALES[locale].direction, t: getDictionary(locale), setLocale, switching }),
    [locale, setLocale, switching]
  );
  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within an I18nProvider");
  return context;
}
