"use client";

import { Input } from "@/components/ui/input";

/**
 * Rupee amount kept as a decimal string; never convert it with Number().
 * Validate with the "invalidAmount" pattern and write with toDbAmount().
 */
export function MoneyInput({ suffix, ...props }: Omit<React.ComponentProps<typeof Input>, "type" | "dir" | "inputMode"> & { suffix?: React.ReactNode }) {
  return (
    <div className="relative" dir="ltr">
      <span className="font-latin pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">Rs</span>
      <Input {...props} dir="ltr" inputMode="decimal" autoComplete="off" className="px-9 text-right! tabular-nums" />
      {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">{suffix}</span>}
    </div>
  );
}
