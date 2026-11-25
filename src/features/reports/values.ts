import { bi } from "@/features/documents/format";
import { getDictionary, type Dictionary } from "@/i18n";
import type { Bi, Value } from "@/lib/pdf/model";
import { sumPaisa, toDbAmount, toPaisa, type Paisa } from "@/lib/utils/money";
import type { Locale } from "@/types";
import type { BadgeTone } from "@/components/shared/status-badge";
import { formatBucket, formatDate, formatNumber } from "@/components/shared/format";
import type { ReportColumn, ReportRow, ReportTable, ReportValue } from "./model";

export const ZERO = BigInt(0);
export const isBi = (value: ReportValue): value is Bi => typeof value === "object" && value !== null;
export const inLocale = (value: Value, locale: Locale): string => (typeof value === "string" ? value : value[locale]);

/** Labels and colours of a status in both languages. */
export function statusOptions(pick: (t: Dictionary) => Record<string, { label: string; tone: BadgeTone }>): Record<string, { label: Bi; tone: BadgeTone }> {
  const ur = pick(getDictionary("ur"));
  return Object.fromEntries(Object.entries(pick(getDictionary("en"))).map(([key, o]) => [key, { label: { en: o.label, ur: ur[key]?.label ?? o.label }, tone: o.tone }]));
}
export const bucketBi = (start: string, bucket: "day" | "month"): Bi => ({ en: formatBucket(start, bucket, "en"), ur: formatBucket(start, bucket, "ur") });
export const dateBi = (iso: string): Bi => ({ en: formatDate(iso, "en") ?? iso, ur: formatDate(iso, "ur") ?? iso });
export const countBi = (n: number): Bi => ({ en: formatNumber(n, "en"), ur: formatNumber(n, "ur") });

/** The exact sum of a column of amounts. */
export const sumOf = (amounts: (number | string | null | undefined)[]): Paisa => sumPaisa(amounts.map((v) => toPaisa(v ?? 0)));

const present = (value: ReportValue): value is string | number => (typeof value === "number" || typeof value === "string") && value !== "";
/** The exact total of a column as decimal text, or null when it has no values. */
export function columnTotal(column: ReportColumn, rows: readonly ReportRow[]): string | null {
  if (!column.total) return null;
  const values = rows.map((r) => r[column.key]).filter(present);
  if (values.length === 0) return null;
  if (column.kind === "quantity") return values.reduce<bigint>((sum, v) => sum + BigInt(String(v)), ZERO).toString();
  return toDbAmount(sumPaisa(values.map((v) => toPaisa(v))));
}

/** A cell as plain text of one language: amounts and quantities as decimal text, dates as ISO text. */
export function plain(column: Pick<ReportColumn, "kind" | "options">, value: ReportValue, locale: Locale): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (isBi(value)) return value[locale];
  if (column.kind === "status") return column.options?.[String(value)]?.label[locale] ?? String(value);
  if (column.kind === "money") return toDbAmount(toPaisa(value));
  return String(value);
}

/** Rows of a table in one language, for the screen. */
export const localRows = (table: ReportTable, locale: Locale) => table.rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, v]) => [key, isBi(v) ? v[locale] : v])) as { id: string } & Record<string, string | number | null | undefined>);

export const text = bi;
