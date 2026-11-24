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

/** Counts and quantities with grouping and Latin digits. Not for money: use formatPaisa. */
export function formatNumber(value: number | bigint, locale: Locale): string {
  return new Intl.NumberFormat(locale === "ur" ? "ur-PK" : "en-PK", { numberingSystem: "latn" }).format(value);
}

/** Axis label for a chart bucket: a day, the first day of a week, or a month. */
export function formatBucket(start: string, bucket: "day" | "week" | "month", locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ur" ? "ur-PK" : "en-PK", {
    ...(bucket === "month" ? { month: "short", year: "numeric" } : { day: "numeric", month: "short" }),
    numberingSystem: "latn",
    timeZone: "UTC",
  }).format(new Date(`${start}T00:00:00Z`));
}
