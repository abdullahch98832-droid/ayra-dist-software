export type { Database, Json } from "./database";

export type Locale = "en" | "ur";
export type Direction = "ltr" | "rtl";

export interface LocaleConfig {
  locale: Locale;
  direction: Direction;
  label: string;
  nativeLabel: string;
}

export const LOCALES: Record<Locale, LocaleConfig> = {
  en: {
    locale: "en",
    direction: "ltr",
    label: "English",
    nativeLabel: "English",
  },
  ur: {
    locale: "ur",
    direction: "rtl",
    label: "Urdu",
    nativeLabel: "اردو",
  },
};

export interface AppUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  locale: Locale;
}
