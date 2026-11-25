import { getDictionary, type Dictionary } from "@/i18n";
import { fill } from "@/i18n/format";
import type { Bi, Cell, Value } from "@/lib/pdf/model";
import { formatPaisa, toPaisa, type Paisa } from "@/lib/utils/money";
import { formatDate, formatNumber } from "@/components/shared/format";

const EN = getDictionary("en");
const UR = getDictionary("ur");

/** A dictionary entry in both languages. */
export const bi = (pick: (t: Dictionary) => string, values?: Record<string, string | number>): Bi => ({
  en: values ? fill(pick(EN), values) : pick(EN), ur: values ? fill(pick(UR), values) : pick(UR),
});
/** An entry of a dictionary record, such as a status; unknown keys show as they are. */
export const biKey = (pick: (t: Dictionary) => object, key: string | null | undefined): Bi => {
  const of = (t: Dictionary) => (pick(t) as Record<string, string>)[key ?? ""] ?? key ?? "";
  return { en: of(EN), ur: of(UR) };
};
/** A name stored in English and, perhaps, in Urdu. */
export const name = (en: string | null | undefined, ur: string | null | undefined): Value => (ur ? { en: en || ur, ur } : en ?? "");

const DASH: Cell = { text: "—" };
export const text = (value: Value | null | undefined, extra: Partial<Cell> = {}): Cell => (value === null || value === undefined || value === "" ? DASH : { text: value, ...extra });
export const code = (value: string | null | undefined, extra: Partial<Cell> = {}): Cell => (value ? { text: value, code: true, ...extra } : DASH);
export const date = (iso: string | null | undefined): Cell => (iso ? { text: dateBi(iso), single: true } : DASH);
export const dateBi = (iso: string): Bi => ({ en: formatDate(iso, "en") ?? iso, ur: formatDate(iso, "ur") ?? iso });

const ZERO = BigInt(0);
export const isZero = (amount: string | null | undefined) => !amount || toPaisa(amount) === ZERO;
const tone = (amount: Paisa): Partial<Cell> => (amount < ZERO ? { tone: "danger" } : {});
/** "Rs 1,234.50", for totals. */
export const rupees = (amount: string | number | Paisa, extra: Partial<Cell> = {}): Cell => {
  const paisa = typeof amount === "bigint" ? amount : toPaisa(amount);
  return { text: formatPaisa(paisa), code: true, ...tone(paisa), ...extra };
};
/** "1,234.50", for columns headed (Rs). */
export const figure = (amount: string | number | Paisa | null | undefined, extra: Partial<Cell> = {}): Cell => {
  if (amount === null || amount === undefined) return { ...DASH, code: true };
  const paisa = typeof amount === "bigint" ? amount : toPaisa(amount);
  return { text: formatPaisa(paisa).replace("Rs ", ""), code: true, ...tone(paisa), ...extra };
};
/** An amount, or a dash when it is zero. */
export const figureOrDash = (amount: string | number | null | undefined): Cell => (amount === null || amount === undefined || toPaisa(amount) === ZERO ? { ...DASH, code: true } : figure(amount));
/** Quantities may have up to three decimals (hours, litres); never money. */
export const quantity = (value: string | number | null | undefined, extra: Partial<Cell> = {}): Cell => {
  if (value === null || value === undefined) return { ...DASH, code: true };
  const n = Number(value);
  return { text: Number.isInteger(n) ? formatNumber(BigInt(n), "en") : new Intl.NumberFormat("en-PK", { maximumFractionDigits: 3 }).format(n), code: true, ...(n < 0 ? { tone: "danger" as const } : {}), ...extra };
};
