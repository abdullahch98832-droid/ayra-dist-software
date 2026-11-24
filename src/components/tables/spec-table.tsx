"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Download, Printer } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { toCsv } from "@/lib/utils/csv";
import { formatPaisa, sumPaisa, toPaisa } from "@/lib/utils/money";
import { Ltr } from "@/components/shared/bidi";
import { formatDate, formatDateTime, formatNumber } from "@/components/shared/format";
import { StatusBadge, type BadgeTone } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "./data-table";
import { UrlPagination } from "./url-filters";

export type Cell = string | number | boolean | null | undefined;
export type SpecRow = { id: string } & Record<string, Cell>;

/** A column described as data, so pages can define tables on the server. */
export interface SpecColumn {
  key: string;
  label: string;
  /** `link` reads its address from `<key>Href`. Money is a decimal string or PostgREST number. */
  kind: "text" | "link" | "code" | "date" | "datetime" | "quantity" | "money" | "percent" | "status";
  /** Second line in small print, read from this key. */
  sub?: string;
  hideBelow?: "lg" | "xl" | "2xl";
  primary?: boolean;
  /** Adds up all rows in the footer (quantity and money). */
  total?: boolean;
  /** Labels and colours for `status`. */
  options?: Record<string, { label: string; tone: BadgeTone }>;
}

export function SpecTable({ rows, columns, caption, empty, toolbar, searchKeys, searchPlaceholder, initialSort, exportName, pageSize, server }: {
  rows: SpecRow[];
  columns: SpecColumn[];
  caption: string;
  empty: React.ComponentProps<typeof DataTable>["empty"];
  toolbar?: React.ReactNode;
  /** Keys matched by the search box; omit when the server searches. */
  searchKeys?: string[];
  searchPlaceholder?: string;
  initialSort?: { id: string; descending?: boolean };
  /** Shows CSV export and print; used as the file name. */
  exportName?: string;
  pageSize?: number;
  /** The rows are one page of `total`; search and paging happen on the server. */
  server?: { page: number; pageSize: number; total: number };
}) {
  const { t, locale } = useI18n();
  const params = useSearchParams();
  // An empty page of a filtered list means nothing matched, not that there is nothing.
  const nothing = server && params.size > 0 ? { title: t.table.noMatches, description: t.table.noMatchesHint } : empty;

  const render = (c: SpecColumn, row: SpecRow): React.ReactNode => {
    const value = row[c.key];
    if (value === null || value === undefined || value === "") return "—";
    switch (c.kind) {
      case "link": return <Link href={String(row[`${c.key}Href`] ?? "#")} className="font-medium break-words hover:text-primary hover:underline"><bdi>{String(value)}</bdi></Link>;
      case "code": return <Ltr className="font-mono text-xs">{String(value)}</Ltr>;
      case "date": return <bdi className="whitespace-nowrap">{formatDate(String(value), locale)}</bdi>;
      case "datetime": return <bdi className="whitespace-nowrap">{formatDateTime(String(value), locale)}</bdi>;
      case "quantity": return <Ltr className={cn("tabular-nums", String(value).startsWith("-") && "text-destructive")}>{formatNumber(BigInt(String(value)), locale)}</Ltr>;
      case "money": {
        const amount = toPaisa(value as string | number);
        return <Ltr className={cn("whitespace-nowrap tabular-nums", amount < BigInt(0) && "text-destructive")}>{formatPaisa(amount, locale)}</Ltr>;
      }
      case "percent": return <Ltr className="tabular-nums">{`${String(value)}%`}</Ltr>;
      case "status": {
        const option = c.options?.[String(value)];
        return <StatusBadge tone={option?.tone ?? "gray"}>{option?.label ?? String(value)}</StatusBadge>;
      }
      default: return <bdi className="break-words">{String(value)}</bdi>;
    }
  };

  const sortValue = (c: SpecColumn, row: SpecRow) => {
    const value = row[c.key];
    if (value === null || value === undefined || value === "") return null;
    if (c.kind === "money") return toPaisa(value as string | number);
    if (c.kind === "quantity") return BigInt(String(value));
    if (c.kind === "percent") return Number(value);
    return c.kind === "status" ? c.options?.[String(value)]?.label ?? String(value) : String(value);
  };

  const footer = (c: SpecColumn, rows: readonly SpecRow[]): React.ReactNode | undefined => {
    if (!c.total || rows.length === 0) return undefined;
    const values = rows.map((r) => r[c.key]).filter((v): v is string | number => v !== null && v !== undefined && v !== "");
    if (values.length === 0) return undefined;
    return c.kind === "money"
      ? <Ltr className="whitespace-nowrap">{formatPaisa(sumPaisa(values.map((v) => toPaisa(v))), locale)}</Ltr>
      : <Ltr>{formatNumber(values.reduce<bigint>((sum, v) => sum + BigInt(String(v)), BigInt(0)), locale)}</Ltr>;
  };

  const end = (c: SpecColumn) => c.kind === "quantity" || c.kind === "money" || c.kind === "percent";
  const tableColumns: DataTableColumn<SpecRow>[] = columns.map((c) => ({
    id: c.key, header: c.label, primary: c.primary, hideBelow: c.hideBelow, align: end(c) ? "end" : "start",
    cell: (row) => c.sub && row[c.sub]
      ? <div className="min-w-0">{render(c, row)}<div className="text-xs text-muted-foreground"><bdi>{String(row[c.sub])}</bdi></div></div>
      : render(c, row),
    sortValue: (row) => sortValue(c, row),
    footer: c.total ? (matching) => footer(c, matching) : undefined,
  }));

  const download = () => {
    const header = columns.flatMap((c) => (c.sub ? [c.label, ""] : [c.label]));
    const body = rows.map((row) => columns.flatMap((c) => {
      const value = row[c.key];
      const text = c.kind === "status" ? c.options?.[String(value)]?.label ?? value : value;
      return c.sub ? [text, row[c.sub]] : [text];
    }));
    const url = URL.createObjectURL(new Blob([toCsv([header, ...body])], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${exportName}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DataTable
      rows={rows} columns={tableColumns} rowKey={(r) => r.id} caption={caption} empty={nothing} initialSort={initialSort}
      pageSize={server?.pageSize ?? pageSize} paging={server && <UrlPagination {...server} />}
      searchText={searchKeys ? (r) => searchKeys.map((k) => r[k] ?? "").join(" ") : undefined}
      searchPlaceholder={searchPlaceholder}
      toolbar={(toolbar || exportName) ? (
        <>
          {toolbar}
          {exportName && rows.length > 0 && (
            <div className="flex gap-2 sm:ms-auto print:hidden">
              <Button variant="outline" onClick={download}><Download aria-hidden />{t.reports.export}</Button>
              <Button variant="outline" onClick={() => window.print()}><Printer aria-hidden />{t.reports.print}</Button>
            </div>
          )}
        </>
      ) : undefined}
    />
  );
}
