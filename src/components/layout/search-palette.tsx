"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Building2, ClipboardList, Package, Plus, Search, ShoppingCart, Truck, UserRound, Waypoints } from "lucide-react";
import { visibleNavigation } from "@/config/navigation";
import { searchRecordsAction } from "@/features/search/actions";
import { SEARCH_GROUPS, type SearchHits } from "@/features/search/types";
import { useI18n } from "@/i18n/context";
import { Ltr } from "@/components/shared/bidi";
import { Button } from "@/components/ui/button";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

const NO_HITS: SearchHits = { customers: [], orders: [], solJobs: [], vehicles: [], products: [], suppliers: [], employees: [] };
const HIT_ICON = { customers: Building2, orders: ShoppingCart, solJobs: Waypoints, vehicles: Truck, products: Package, suppliers: ClipboardList, employees: UserRound } as const;

type Status = "idle" | "loading" | "failed";

/** Pages come from the navigation config; records are searched on the server under the user's permissions. */
export function SearchPalette({ permissions }: { permissions: ReadonlySet<string> }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHits>(NO_HITS);
  const [status, setStatus] = useState<Status>("idle");
  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer.current);
    };
  }, []);

  const change = (value: string) => {
    setQuery(value);
    clearTimeout(timer.current);
    const id = ++request.current;
    if (value.trim().length < 2) {
      setHits(NO_HITS);
      setStatus("idle");
      return;
    }
    setStatus("loading");
    timer.current = setTimeout(async () => {
      const result = await searchRecordsAction(value).catch(() => ({ ok: false as const }));
      if (request.current !== id) return; // a newer search has started
      setHits(result.ok ? result.hits : NO_HITS);
      setStatus(result.ok ? "idle" : "failed");
    }, 250);
  };

  const go = (href: string) => {
    setOpen(false);
    change("");
    router.push(href);
  };

  const needle = query.trim().toLocaleLowerCase(locale);
  const matches = (text: string) => !needle || text.toLocaleLowerCase(locale).includes(needle);
  const pages = visibleNavigation(permissions)
    .flatMap((g) => g.items.map((item) => ({ item, label: item.label(t), group: t.nav.groups[g.key] })))
    .filter(({ label, group, item }) => matches(`${label} ${group} ${item.href}`));
  const actions = [
    { href: "/sales/orders/new", label: t.sales.newOrder, permission: "sales.create" },
    { href: "/receivables/payments/new", label: t.receivables.newPayment, permission: "receivables.collect" },
    { href: "/sol/jobs/new", label: t.sol.newJob, permission: "sol.manage" },
    { href: "/expenses/new", label: t.expenses.add, permission: "expenses.create" },
    { href: "/accounting/journal/new", label: t.accounting.newJournal, permission: "accounting.journal" },
    { href: "/cash-bank/transfers/new", label: t.cashBank.newTransfer, permission: "cash_bank.transfer" },
    { href: "/payroll/advances/new", label: t.payroll.newAdvance, permission: "payroll.manage" },
    { href: "/vehicles/new", label: t.vehicles.add, permission: "vehicles.manage" },
    { href: "/customers/new", label: t.customers.add, permission: "customers.manage" },
    { href: "/products/new", label: t.catalog.add, permission: "products.manage" },
    { href: "/purchasing/company/receipts/new", label: `${t.purchasing.newReceipt} · ${t.purchasing.flows.company}`, permission: "purchasing.create" },
    { href: "/purchasing/suppliers/receipts/new", label: `${t.purchasing.newReceipt} · ${t.purchasing.flows.suppliers}`, permission: "purchasing.create" },
    { href: "/inventory/transfers/new", label: t.stock.newTransfer, permission: "inventory.transfer" },
    { href: "/inventory/counts/new", label: t.stock.newCount, permission: "inventory.count" },
    { href: "/suppliers/new", label: t.suppliers.add, permission: "suppliers.manage" },
    { href: "/employees/new", label: t.employees.add, permission: "employees.manage" },
  ].filter((a) => permissions.has(a.permission) && matches(a.label));

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        aria-label={t.search.title}
        aria-keyshortcuts="Control+K Meta+K"
        className="size-9 justify-center px-0 font-normal text-muted-foreground sm:w-full sm:max-w-sm sm:justify-start sm:px-3"
      >
        <Search aria-hidden />
        <span className="hidden flex-1 truncate text-start sm:inline">{t.search.placeholder}</span>
        <kbd className="font-latin hidden rounded border bg-muted px-1.5 text-[0.6875rem] lg:inline" dir="ltr">Ctrl K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) change(""); }} title={t.search.title} description={t.search.description}>
        <Command shouldFilter={false} className="p-2">
          <CommandInput value={query} onValueChange={change} placeholder={t.search.placeholder} />
          <CommandList className="mt-2">
            {status === "loading" && <p role="status" className="px-3 py-2 text-sm text-muted-foreground">{t.search.searching}</p>}
            {status === "failed" && <p role="alert" className="px-3 py-2 text-sm text-destructive">{t.search.failed}</p>}
            {status === "idle" && <CommandEmpty className="text-muted-foreground">{t.search.empty}</CommandEmpty>}
            {SEARCH_GROUPS.map((group) => {
              const Icon = HIT_ICON[group];
              return hits[group].length > 0 && (
                <CommandGroup key={group} heading={t.search[group]}>
                  {hits[group].map((hit) => (
                    <CommandItem key={hit.id} value={`${group}-${hit.id}`} onSelect={() => go(hit.href)}>
                      <Icon aria-hidden />
                      <span className="min-w-0 truncate">{locale === "ur" && hit.titleUr ? hit.titleUr : hit.title}</span>
                      <Ltr className="text-xs text-muted-foreground">{hit.detail}</Ltr>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
            {actions.length > 0 && (
              <CommandGroup heading={t.search.actions}>
                {actions.map((a) => (
                  <CommandItem key={a.href} value={`action-${a.href}`} onSelect={() => go(a.href)}><Plus aria-hidden />{a.label}</CommandItem>
                ))}
              </CommandGroup>
            )}
            {pages.length > 0 && (
              <CommandGroup heading={t.search.pages}>
                {pages.map(({ item, label, group }) => (
                  <CommandItem key={item.href} value={`page-${item.href}`} onSelect={() => go(item.href)}>
                    <item.icon aria-hidden />
                    <span className="min-w-0 truncate">{label}</span>
                    <span className="truncate text-xs text-muted-foreground">{item.planned ? t.nav.planned : group}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
