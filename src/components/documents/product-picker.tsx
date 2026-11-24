"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, PackagePlus } from "lucide-react";
import { searchProductsAction } from "@/features/catalog/search-action";
import type { ProductOption } from "@/features/catalog/types";
import { useI18n } from "@/i18n/context";
import { Ltr } from "@/components/shared/bidi";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Searches the catalog by name, SKU or scanned barcode and hands the product to `onPick`. */
export function ProductPicker({ onPick, disabled }: { onPick: (product: ProductOption) => void; disabled?: boolean }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "failed">("idle");
  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const search = (text: string, delay: number) => {
    setQuery(text);
    clearTimeout(timer.current);
    const id = ++request.current;
    setState("loading");
    timer.current = setTimeout(async () => {
      const result = await searchProductsAction(text).catch(() => null);
      if (request.current !== id) return;
      setOptions(result ?? []);
      setState(result ? "idle" : "failed");
    }, delay);
  };

  const pick = (product: ProductOption) => {
    onPick(product);
    search("", 0); // stay open so several products can be added or scanned in a row
  };

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) search("", 0); }}>
      <PopoverTrigger render={<Button type="button" variant="outline" disabled={disabled} />}>
        <PackagePlus aria-hidden />{t.documents.addProduct}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))] p-0">
        <Command shouldFilter={false} className="p-2">
          <CommandInput value={query} onValueChange={(v) => search(v, 200)} placeholder={t.documents.searchProduct} autoFocus />
          <CommandList className="mt-2">
            {state === "loading" && options.length === 0 && <p role="status" className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden />{t.search.searching}</p>}
            {state === "failed" && <p role="alert" className="px-3 py-3 text-sm text-destructive">{t.search.failed}</p>}
            {state === "idle" && <CommandEmpty className="text-muted-foreground">{t.documents.noProduct}</CommandEmpty>}
            {options.map((p) => (
              <CommandItem key={p.id} value={p.id} onSelect={() => pick(p)}>
                <span className="min-w-0 flex-1">
                  <span className="block break-words">{locale === "ur" && p.nameUr ? p.nameUr : p.nameEn}</span>
                  <Ltr className="text-xs text-muted-foreground">{p.sku}</Ltr>
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
