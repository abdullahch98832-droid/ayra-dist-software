import type { Locale } from "@/types";

export const LOCALE_COOKIE = "ayra_locale";

export function parseLocale(value: string | undefined | null): Locale {
  return value === "ur" ? "ur" : "en";
}
