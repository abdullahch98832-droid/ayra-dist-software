import type { Metadata } from "next";
import { loadWarehouseChoices } from "@/features/catalog/queries";
import { businessToday, parsePeriod } from "@/features/dashboard/period";
import { inventoryPage, uuidParam } from "@/features/inventory/page-context";
import { loadMovements, loadProductName, MOVEMENT_PAGE } from "@/features/inventory/queries";
import { fill } from "@/i18n/format";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/shared/link-button";
import { MovementsTable } from "@/components/documents/movements-table";
import { UrlSelect } from "@/components/tables/url-filters";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).stock.tabs.movements };
}

export default async function MovementsPage({ searchParams }: PageProps<"/inventory/movements">) {
  const { ctx, t, local } = await inventoryPage();
  if (!can(ctx, "inventory.view")) return <Forbidden />;
  const s = t.stock;
  const query = await searchParams;
  const today = businessToday();
  const period = parsePeriod(query, today);
  const types = s.movementTypes;
  const type = typeof query.type === "string" && query.type in types ? query.type : null;
  const productId = uuidParam(query.product);
  const requestedPage = Number.parseInt(typeof query.page === "string" ? query.page : "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.min(Math.max(requestedPage, 1), 100_000) : 1;
  const filter = { from: period.from, to: period.to, productId, warehouseId: uuidParam(query.warehouse), type };
  const [{ rows, total }, warehouses, product] = await Promise.all([
    loadMovements(filter, MOVEMENT_PAGE, (page - 1) * MOVEMENT_PAGE), loadWarehouseChoices(), productId ? loadProductName(productId) : null,
  ]);

  return (
    <>
      <PageHeader title={s.tabs.movements} description={s.movementsHint} />
      <PeriodFrame
        key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today}
        title={product ? fill(s.forProduct, { name: local(product.name_en, product.name_ur) }) : s.tabs.movements} description={s.movementsHint}
      >
        <MovementsTable
          t={t} local={local} rows={rows} costs={can(ctx, "costs.view")}
          toolbar={
            <>
              <UrlSelect param="warehouse" label={s.allWarehouses} options={warehouses.map((w) => ({ value: w.id, label: local(w.nameEn, w.nameUr) }))} />
              <UrlSelect param="type" label={s.allTypes} options={Object.entries(types).map(([value, label]) => ({ value, label }))} />
              {product && <LinkButton variant="outline" href="/inventory/movements">{s.clearProduct}</LinkButton>}
            </>
          }
          server={{ page, pageSize: MOVEMENT_PAGE, total }}
        />
      </PeriodFrame>
    </>
  );
}
