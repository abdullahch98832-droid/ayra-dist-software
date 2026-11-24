import type { Metadata } from "next";
import { loadWarehouseChoices } from "@/features/catalog/queries";
import { uuidParam } from "@/features/inventory/page-context";
import { loadProductName } from "@/features/inventory/queries";
import { REPORTS } from "@/features/reports/catalog";
import { reportPage } from "@/features/reports/page-context";
import { reportMovements } from "@/features/reports/queries";
import { fill } from "@/i18n/format";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { FormAlert } from "@/components/forms/field";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { formatNumber } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { UrlSelect } from "@/components/tables/url-filters";
import { MovementsTable } from "@/components/documents/movements-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).reports.movements };
}

export default async function MovementReportPage({ searchParams }: PageProps<"/reports/movements">) {
  const { ctx, t, locale, query, today, period, allowed, local } = await reportPage(REPORTS.movements, searchParams);
  if (!allowed) return <Forbidden />;
  const s = t.stock;
  const type = typeof query.type === "string" && query.type in s.movementTypes ? query.type : null;
  const productId = uuidParam(query.product);
  const [{ rows, total }, warehouses, product] = await Promise.all([
    reportMovements({ from: period.from, to: period.to, productId, warehouseId: uuidParam(query.warehouse), type }), loadWarehouseChoices(), productId ? loadProductName(productId) : null,
  ]);
  return (
    <>
      <PageHeader title={t.reports.movements} breadcrumbs={[{ label: t.reports.title, href: "/reports" }]} />
      <PeriodFrame
        key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today}
        title={product ? fill(s.forProduct, { name: local(product.name_en, product.name_ur) }) : t.reports.movements} description={t.reports.movementsHint}
      >
        {total > rows.length && <FormAlert tone="info">{fill(t.reports.limited, { count: formatNumber(rows.length, locale), total: formatNumber(total, locale) })}</FormAlert>}
        <MovementsTable
          t={t} local={local} rows={rows} costs={can(ctx, "costs.view")} exportName={`movements-${period.from}-${period.to}`}
          toolbar={
            <>
              <UrlSelect param="warehouse" label={s.allWarehouses} options={warehouses.map((w) => ({ value: w.id, label: local(w.nameEn, w.nameUr) }))} />
              <UrlSelect param="type" label={s.allTypes} options={Object.entries(s.movementTypes).map(([value, label]) => ({ value, label }))} />
              {product && <LinkButton variant="outline" href="/reports/movements">{s.clearProduct}</LinkButton>}
            </>
          }
        />
      </PeriodFrame>
    </>
  );
}
