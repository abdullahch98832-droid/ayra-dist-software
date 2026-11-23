import type { Locale } from "@/types";

/** Dates and times with Latin digits in both languages (consistent with amounts and codes). */
export function formatDateTime(value: string | null | undefined, locale: Locale): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat(locale === "ur" ? "ur-PK" : "en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
    numberingSystem: "latn",
  }).format(new Date(value));
}

export function formatDate(value: string | null | undefined, locale: Locale): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat(locale === "ur" ? "ur-PK" : "en-PK", {
    dateStyle: "medium",
    numberingSystem: "latn",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}
