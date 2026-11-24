"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronsUpDown, LoaderCircle } from "lucide-react";
import { searchCustomersAction } from "@/features/customers/actions";
import type { CustomerOption } from "@/features/customers/schema";
import { useI18n } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { Ltr } from "@/components/shared/bidi";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Finds a customer by shop, owner, code or phone. Shops can be many, so the server searches. */
export function CustomerPicker({ id, value, onChange, disabled, ...aria }: {
  id?: string;
  value: CustomerOption | null;
  onChange: (customer: CustomerOption) => void;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<CustomerOption[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "failed">("idle");
  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const name = (c: CustomerOption) => (locale === "ur" && c.nameUr ? c.nameUr : c.nameEn);

  const search = (text: string, delay: number) => {
    setQuery(text);
    clearTimeout(timer.current);
    const current = ++request.current;
    setState("loading");
    timer.current = setTimeout(async () => {
      const result = await searchCustomersAction(text).catch(() => null);
      if (request.current !== current) return;
      setOptions(result ?? []);
      setState(result ? "idle" : "failed");
    }, delay);
  };

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) search("", 0); }}>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        {...aria}
        className={cn(
          "flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 py-1.5 text-start text-base shadow-xs outline-none transition-colors md:text-sm",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 disabled:bg-muted disabled:opacity-70 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
        )}
      >
        <span className={cn("min-w-0 break-words", !value && "text-muted-foreground")}>{value ? name(value) : t.customers.choose}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))] p-0">
        <Command shouldFilter={false} className="p-2">
          <CommandInput value={query} onValueChange={(v) => search(v, 200)} placeholder={t.customers.search} autoFocus />
          <CommandList className="mt-2">
            {state === "loading" && options.length === 0 && <p role="status" className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden />{t.search.searching}</p>}
            {state === "failed" && <p role="alert" className="px-3 py-3 text-sm text-destructive">{t.search.failed}</p>}
            {state === "idle" && <CommandEmpty className="text-muted-foreground">{t.customers.none}</CommandEmpty>}
            {options.map((c) => (
              <CommandItem key={c.id} value={c.id} onSelect={() => { onChange(c); setOpen(false); }}>
                <span className="min-w-0 flex-1">
                  <span className="block break-words">{name(c)}</span>
                  <span className="block text-xs text-muted-foreground"><Ltr>{c.code}</Ltr>{c.city && <> · <bdi>{c.city}</bdi></>}</span>
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
