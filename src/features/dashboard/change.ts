import type { Paisa } from "@/lib/utils/money";

export interface Change {
  /** Absolute change in tenths of a percent, e.g. 125 = 12.5%. */
  permille: number;
  direction: "up" | "down" | "flat";
}

/** Change against the previous period, or null when there is nothing to compare with. */
export function changeFrom(current: Paisa, previous: Paisa): Change | null {
  const zero = BigInt(0);
  if (previous === zero) return null;
  const abs = (v: bigint) => (v < zero ? -v : v);
  const difference = current - previous;
  const permille = Number((abs(difference) * BigInt(1000)) / abs(previous));
  return { permille, direction: difference > zero ? "up" : difference < zero ? "down" : "flat" };
}
