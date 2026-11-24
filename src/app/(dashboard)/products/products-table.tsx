"use client";

import Image from "next/image";
import Link from "next/link";
import { Package } from "lucide-react";
import { useI18n } from "@/i18n/context";
import type { ProductListRow } from "@/features/catalog/queries";
import { formatPaisa, toPaisa } from "@/lib/utils/money";
import { Ltr } from "@/components/shared/bidi";
import { formatNumber } from "@/components/shared/format";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";

export function ProductsTable({ rows, toolbar, empty, showStock }: {
  rows: ProductListRow[];
  toolbar: React.ReactNode;
  empty: React.ComponentProps<typeof DataTable>["empty"];
  showStock: boolean;
}) {
  const { t, locale } = useI18n();
  const local = (en: string | null, ur: string | null) => (locale === "ur" && ur ? ur : en) ?? "—";
  const columns: DataTableColumn<ProductListRow>[] = [
    {
      id: "name", header: t.documents.product, primary: true, sortValue: (p) => local(p.nameEn, p.nameUr),
      cell: (p) => (
        <Link href={`/products/${p.id}`} className="group flex items-center gap-3 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/40">
          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted text-muted-foreground">
            {p.imageUrl ? <Image src={p.imageUrl} alt="" width={40} height={40} unoptimized className="size-full object-cover" /> : <Package className="size-4.5" aria-hidden />}
          </span>
          <span className="min-w-0">
            <span className="block font-medium break-words group-hover:text-primary group-hover:underline">{local(p.nameEn, p.nameUr)}</span>
            <Ltr className="text-xs text-muted-foreground">{p.sku}</Ltr>
          </span>
        </Link>
      ),
    },
    { id: "category", header: t.catalog.category, hideBelow: "lg", sortValue: (p) => local(p.categoryEn, p.categoryUr), cell: (p) => local(p.categoryEn, p.categoryUr) },
    { id: "brand", header: t.catalog.brand, hideBelow: "xl", sortValue: (p) => local(p.brandEn, p.brandUr), cell: (p) => local(p.brandEn, p.brandUr) },
    {
      id: "price", header: t.catalog.sellingPrice, align: "end", sortValue: (p) => (p.price === null ? null : toPaisa(p.price)),
      cell: (p) => (p.price === null ? "—" : <Ltr>{formatPaisa(toPaisa(p.price), locale)}</Ltr>),
    },
    ...(showStock ? [{
      id: "stock", header: t.catalog.available, align: "end" as const, sortValue: (p: ProductListRow) => p.available,
      cell: (p: ProductListRow) => {
        const low = p.minimum > 0 && (p.available ?? 0) <= p.minimum;
        const text = `${formatNumber(p.available ?? 0, locale)} ${local(p.unitEn, p.unitUr)}`;
        return low ? <StatusBadge tone={(p.available ?? 0) <= 0 ? "red" : "amber"}>{text}</StatusBadge> : text;
      },
    }] : []),
    { id: "status", header: t.common.status, hideBelow: "lg", cell: (p) => <StatusBadge tone={p.isActive ? "green" : "gray"}>{p.isActive ? t.catalog.active : t.catalog.inactive}</StatusBadge> },
  ];
  return <DataTable rows={rows} columns={columns} rowKey={(p) => p.id} caption={t.catalog.title} toolbar={toolbar} empty={empty} initialSort={{ id: "name" }} />;
}
