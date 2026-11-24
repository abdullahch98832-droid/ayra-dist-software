"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/context";
import { formatPaisa, toPaisa } from "@/lib/utils/money";
import { Ltr } from "@/components/shared/bidi";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";

export interface SupplierRow { id: string; code: string; name: string; nameUr: string | null; phone: string | null; isPrincipal: boolean; isActive: boolean; balance: string | null }

export function SuppliersTable({ rows, toolbar, empty, showBalance }: { rows: SupplierRow[]; toolbar?: React.ReactNode; empty: React.ComponentProps<typeof DataTable>["empty"]; showBalance: boolean }) {
  const { t, locale } = useI18n();
  const local = (r: SupplierRow) => (locale === "ur" && r.nameUr ? r.nameUr : r.name);
  const columns: DataTableColumn<SupplierRow>[] = [
    {
      id: "name", header: t.suppliers.name, primary: true, sortValue: local,
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-2">
          <Link href={`/suppliers/${r.id}`} className="font-medium hover:text-primary hover:underline">{local(r)}</Link>
          {r.isPrincipal && <StatusBadge tone="blue" dot={false}>{t.suppliers.mainCompany}</StatusBadge>}
        </span>
      ),
    },
    { id: "code", header: t.suppliers.code, sortValue: (r) => r.code, cell: (r) => <Ltr className="font-mono text-xs">{r.code}</Ltr> },
    { id: "phone", header: t.suppliers.phone, hideBelow: "lg", cell: (r) => (r.phone ? <Ltr>{r.phone}</Ltr> : "—") },
    ...(showBalance ? [{ id: "balance", header: t.suppliers.payable, align: "end" as const, sortValue: (r: SupplierRow) => (r.balance === null ? null : toPaisa(r.balance)), cell: (r: SupplierRow) => (r.balance === null ? "—" : <Ltr>{formatPaisa(toPaisa(r.balance), locale)}</Ltr>) }] : []),
    { id: "status", header: t.common.status, cell: (r) => <StatusBadge tone={r.isActive ? "green" : "gray"}>{r.isActive ? t.catalog.active : t.catalog.inactive}</StatusBadge> },
  ];
  return (
    <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} caption={t.suppliers.title} toolbar={toolbar} empty={empty} initialSort={{ id: "name" }}
      searchText={(r) => [r.name, r.nameUr, r.code, r.phone].join(" ")} searchPlaceholder={t.suppliers.searchPlaceholder} />
  );
}
