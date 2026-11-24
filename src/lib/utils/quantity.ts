import { lineTotal, parseRupees, type Paisa } from "./money";

const ZERO = BigInt(0);

/** Whole number from a form field, or null while it is not one. */
export function parseQuantity(text: string | undefined): bigint | null {
  const trimmed = (text ?? "").trim();
  return /^-?\d{1,15}$/.test(trimmed) ? BigInt(trimmed) : null;
}

/** Sum of the quantities x price as exact paisa; null until every part is valid. Blank quantities count as zero. */
export function amountOf(quantities: (string | undefined)[], price: string | undefined): Paisa | null {
  let total = ZERO;
  for (const q of quantities) {
    if ((q ?? "").trim() === "") continue;
    const parsed = parseQuantity(q);
    if (parsed === null) return null;
    total += parsed;
  }
  try {
    return lineTotal(total, parseRupees(price ?? ""));
  } catch {
    return null;
  }
}

/** A quantity with up to two decimals x price, rounded to the paisa as the database rounds; null until both are valid. */
export function decimalAmount(quantity: string | undefined, price: string | undefined): Paisa | null {
  try {
    const product = parseRupees(quantity ?? "") * parseRupees(price ?? "");
    const hundred = BigInt(100);
    return (product + BigInt(50)) / hundred;
  } catch {
    return null;
  }
}

/**
 * Base units written in the product's larger units, largest first:
 * 150 pieces with Carton = 72 and Box = 12 gives 2 Carton, 0 Box and 6 left as base.
 */
export function breakdown(base: bigint, units: readonly { name: string; factor: bigint }[]): { name: string; count: bigint }[] {
  let rest = base < ZERO ? -base : base;
  const parts: { name: string; count: bigint }[] = [];
  for (const unit of [...units].sort((a, b) => (a.factor < b.factor ? 1 : -1))) {
    const count = rest / unit.factor;
    if (count > ZERO) parts.push({ name: unit.name, count });
    rest -= count * unit.factor;
  }
  return parts;
}

/** A price for one unit restated for another unit of the same product, rounded to the nearest paisa. */
export function convertPrice(price: Paisa, fromFactor: bigint, toFactor: bigint): Paisa {
  const two = BigInt(2);
  return (price * toFactor * two + fromFactor) / (fromFactor * two);
}

/** Whether a typed whole number is above `max`. False while it is not a number yet. */
export function wholeAbove(text: string, max: number | string | bigint): boolean {
  const entered = parseQuantity(text);
  return entered !== null && entered > BigInt(max);
}

/** The same for numbers with up to two decimals. */
export function decimalAbove(text: string, max: string): boolean {
  try {
    return text.trim() !== "" && parseRupees(text) > parseRupees(max);
  } catch {
    return false;
  }
}
