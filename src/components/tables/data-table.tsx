"use client";

import { useId, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search, SearchX, X } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { StateMessage } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination } from "./table-pagination";

type SortValue = string | number | bigint | null | undefined;

export interface DataTableColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Enables sorting. Use raw values (bigint paisa, ISO dates), never formatted text. */
  sortValue?: (row: T) => SortValue;
  /** `end` for amounts and quantities. */
  align?: "start" | "end";
  /** Drop the column from the table below this width; phone cards always show it. */
  hideBelow?: "lg" | "xl";
  /** Heading of the phone card. Exactly one column should set it. */
  primary?: boolean;
  className?: string;
}

const HIDE = { lg: "hidden lg:table-cell", xl: "hidden xl:table-cell" } as const;

function compare(a: SortValue, b: SortValue, collator: Intl.Collator): number {
  if (a === b) return 0;
  if (a === null || a === undefined || a === "") return 1;
  if (b === null || b === undefined || b === "") return -1;
  if (typeof a === "string" || typeof b === "string") return collator.compare(String(a), String(b));
  return a < b ? -1 : 1;
}

/**
 * Standard list for every module: sorting, search, paging, empty state and a card
 * layout on phones, in both reading directions. State lives on the client, so it
 * survives a language change.
 */
export function DataTable<T>({
  rows, columns, rowKey, caption, searchText, searchPlaceholder, toolbar, actions, empty, pageSize = 25, initialSort,
}: {
  rows: readonly T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string;
  /** Read by screen readers; not displayed. */
  caption: string;
  /** Text to match when searching inside the loaded rows. Omit to search on the server instead. */
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  toolbar?: React.ReactNode;
  actions?: (row: T) => React.ReactNode;
  empty: { title: string; description?: string; action?: React.ReactNode };
  pageSize?: number;
  initialSort?: { id: string; descending?: boolean };
}) {
  const { t, locale } = useI18n();
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(initialSort);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(locale);
    if (!needle || !searchText) return rows;
    return rows.filter((row) => searchText(row).toLocaleLowerCase(locale).includes(needle));
  }, [rows, query, searchText, locale]);

  const sorted = useMemo(() => {
    const value = sort && columns.find((c) => c.id === sort.id)?.sortValue;
    if (!value) return filtered;
    const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
    const isBlank = (v: SortValue) => v === null || v === undefined || v === "";
    return [...filtered].sort((x, y) => {
      const a = value(x);
      const b = value(y);
      const order = compare(a, b, collator);
      // Blank values stay last in both directions.
      return sort.descending && !isBlank(a) && !isBlank(b) ? -order : order;
    });
  }, [filtered, sort, columns, locale]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages);
  const visible = sorted.slice((current - 1) * pageSize, current * pageSize);

  const primary = columns.find((c) => c.primary) ?? columns[0];
  const details = columns.filter((c) => c !== primary);

  const toggleSort = (id: string) => {
    setPage(1);
    setSort((s) => (s?.id === id ? (s.descending ? undefined : { id, descending: true }) : { id }));
  };

  return (
    <div className="grid min-w-0 gap-4">
      {(searchText || toolbar) && (
        <div className="flex flex-wrap items-center gap-2">
          {searchText && (
            <div className="relative w-full sm:w-72">
              <label htmlFor={searchId} className="sr-only">{searchPlaceholder ?? t.table.search}</label>
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id={searchId}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                placeholder={searchPlaceholder ?? t.table.search}
                className="ps-9 pe-9"
              />
              {query && (
                <button
                  type="button" aria-label={t.common.clear} onClick={() => setQuery("")}
                  className="absolute inset-y-0 end-0 flex w-9 items-center justify-center text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          )}
          {toolbar}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-xl border bg-card shadow-card">
          {rows.length === 0
            ? <StateMessage title={empty.title} description={empty.description} actions={empty.action} />
            : <StateMessage icon={SearchX} title={t.table.noMatches} description={t.table.noMatchesHint}
                actions={<Button variant="outline" onClick={() => setQuery("")}>{t.common.clear}</Button>} />}
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border bg-card shadow-card md:block">
            <Table>
              <TableCaption className="sr-only">{caption}</TableCaption>
              <TableHeader>
                <TableRow>
                  {columns.map((c) => {
                    const direction = sort?.id === c.id ? (sort.descending ? "descending" : "ascending") : undefined;
                    const Icon = direction === "ascending" ? ArrowUp : direction === "descending" ? ArrowDown : ChevronsUpDown;
                    return (
                      <TableHead
                        key={c.id}
                        scope="col"
                        aria-sort={c.sortValue ? direction ?? "none" : undefined}
                        className={cn(c.align === "end" && "text-end", c.hideBelow && HIDE[c.hideBelow])}
                      >
                        {c.sortValue ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(c.id)}
                            title={direction === "ascending" ? t.table.sortDescending : t.table.sortAscending}
                            className={cn(
                              "-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40",
                              direction && "text-navy"
                            )}
                          >
                            {c.header}<Icon className={cn("size-3.5", !direction && "opacity-50")} aria-hidden />
                          </button>
                        ) : c.header}
                      </TableHead>
                    );
                  })}
                  {actions && <TableHead scope="col" className="w-14"><span className="sr-only">{t.common.actions}</span></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => (
                  <TableRow key={rowKey(row)}>
                    {columns.map((c) => (
                      <TableCell key={c.id} className={cn(c.align === "end" && "text-end tabular-nums", c.hideBelow && HIDE[c.hideBelow], c.className)}>
                        {c.cell(row)}
                      </TableCell>
                    ))}
                    {actions && <TableCell className="text-end">{actions(row)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="grid gap-3 md:hidden" aria-label={caption}>
            {visible.map((row) => (
              <li key={rowKey(row)} className="rounded-xl border bg-card p-4 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">{primary?.cell(row)}</div>
                  {actions?.(row)}
                </div>
                {details.length > 0 && (
                  <dl className="mt-3 grid gap-2 border-t pt-3">
                    {details.map((c) => (
                      <div key={c.id} className="flex items-start justify-between gap-4 text-sm">
                        <dt className="shrink-0 text-muted-foreground">{c.header}</dt>
                        <dd className="min-w-0 text-end break-words">{c.cell(row)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            ))}
          </ul>

          <TablePagination page={current} pageSize={pageSize} total={sorted.length} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
