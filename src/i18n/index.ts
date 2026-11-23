import type { Locale } from "@/types";
import type { Dictionary } from "./en";
import en from "./en";
import ur from "./ur";

const dictionaries: Record<Locale, Dictionary> = { en, ur };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries.en;
}

export type { Dictionary };
