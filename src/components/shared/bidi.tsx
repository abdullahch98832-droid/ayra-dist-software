import { cn } from "@/lib/utils";
import { formatPaisa, type Paisa } from "@/lib/utils/money";
import type { Locale } from "@/types";

/**
 * A left-to-right value (phone, email, code, amount) inside text of either direction.
 * Keeps digit order without moving the value to the other edge of its cell, which
 * `dir="ltr"` on the cell itself would do.
 */
export function Ltr({ className, children }: { className?: string; children: React.ReactNode }) {
  return <bdi dir="ltr" className={cn("font-latin", className)}>{children}</bdi>;
}

/** Exact money from paisa, aligned for columns. */
export function Money({ amount, locale, className }: { amount: Paisa; locale: Locale; className?: string }) {
  return <Ltr className={cn("tabular-nums", amount < BigInt(0) && "text-destructive", className)}>{formatPaisa(amount, locale)}</Ltr>;
}
