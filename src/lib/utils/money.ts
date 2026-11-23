/** Money is always an integer count of paisa (1 PKR = 100 paisa), held as bigint. */
export type Paisa = bigint;

const PAISA_PER_RUPEE = BigInt(100);
const ZERO = BigInt(0);
const AMOUNT_PATTERN = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/** Parses user input like "1,250.5" into paisa without floating-point math. */
export function parseRupees(input: string): Paisa {
  const normalized = input.trim().replace(/,/g, "");
  const match = AMOUNT_PATTERN.exec(normalized);
  if (!match) throw new Error(`Invalid amount: "${input}"`);
  const [, sign, rupees = "0", fraction = ""] = match;
  const paisa = BigInt(rupees) * PAISA_PER_RUPEE + BigInt(fraction.padEnd(2, "0"));
  return sign ? -paisa : paisa;
}

/**
 * Converts a numeric(18,2) value from the database API to paisa. PostgREST sends
 * numeric as a JSON number; toFixed(2) recovers the exact 2-decimal value it encodes.
 */
export function toPaisa(value: number | string): Paisa {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Invalid amount: ${value}`);
    return parseRupees(value.toFixed(2));
  }
  return parseRupees(value);
}

/** Paisa to the decimal string Postgres numeric accepts, e.g. 123450n → "1234.50". */
export function toDbAmount(amount: Paisa): string {
  const negative = amount < ZERO;
  const abs = negative ? -amount : amount;
  return `${negative ? "-" : ""}${abs / PAISA_PER_RUPEE}.${(abs % PAISA_PER_RUPEE).toString().padStart(2, "0")}`;
}

export function formatPaisa(amount: Paisa, locale: "en" | "ur" = "en"): string {
  const negative = amount < ZERO;
  const abs = negative ? -amount : amount;
  const rupees = abs / PAISA_PER_RUPEE;
  const paisa = (abs % PAISA_PER_RUPEE).toString().padStart(2, "0");
  const grouped = new Intl.NumberFormat(locale === "ur" ? "ur-PK" : "en-PK", {
    numberingSystem: "latn",
  }).format(rupees);
  return `${negative ? "-" : ""}Rs ${grouped}.${paisa}`;
}

export function sumPaisa(amounts: readonly Paisa[]): Paisa {
  return amounts.reduce((total, amount) => total + amount, ZERO);
}

/** quantity × unit price, both exact integers. */
export function lineTotal(quantity: bigint, unitPrice: Paisa): Paisa {
  return quantity * unitPrice;
}
