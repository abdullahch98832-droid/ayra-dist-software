import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { uploadProductImageAction } from "@/features/catalog/actions";
import { loadProduct, loadProductChoices } from "@/features/catalog/queries";
import { getLocale, getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { breakdown } from "@/lib/utils/quantity";
import { formatPaisa, toPaisa } from "@/lib/utils/money";
import { ImageUploader } from "@/components/forms/image-uploader";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr } from "@/components/shared/bidi";
import { DescriptionList } from "@/components/shared/description-list";
import { formatNumber } from "@/components/shared/format";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { LinkButton } from "@/components/shared/link-button";
import { ProductForm } from "../product-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).catalog.edit };
}

export default async function ProductPage({ params }: PageProps<"/products/[id]">) {
  const ctx = await requireActiveSession();
  if (!can(ctx, "products.view")) return <Forbidden />;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [t, locale, product, choices] = await Promise.all([getT(), getLocale(), loadProduct(ctx, id), loadProductChoices(ctx)]);
  if (!product) notFound();
  const canEdit = can(ctx, "products.manage");
  const showCosts = can(ctx, "costs.view");
  const title = locale === "ur" && product.name_ur ? product.name_ur : product.name_en;
  const label = (list: { id: string; nameEn: string; nameUr: string | null }[], key: string | null) => {
    const found = list.find((c) => c.id === key);
    return found ? (locale === "ur" && found.nameUr ? found.nameUr : found.nameEn) : null;
  };
  const base = product.units.find((u) => u.unitId === product.base_unit_id);

  return (
    <>
      <PageHeader
        title={title}
        breadcrumbs={[{ label: t.catalog.title, href: "/products" }]}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Ltr className="font-mono text-xs">{product.sku}</Ltr>
            <StatusBadge tone={product.is_active ? "green" : "gray"}>{product.is_active ? t.catalog.active : t.catalog.inactive}</StatusBadge>
          </span>
        }
        actions={can(ctx, "inventory.view") && <LinkButton variant="outline" href={`/inventory/movements?product=${id}`}>{t.stock.tabs.movements}</LinkButton>}
      />
      <div className="grid max-w-5xl gap-6">
        {can(ctx, "inventory.view") && <StockByWarehouse productId={id} />}
        <ImageUploader id={id} url={product.imageUrl} title={t.catalog.image} buttonLabel={t.catalog.uploadImage} success={t.catalog.imageUpdated} canEdit={canEdit} action={uploadProductImageAction} />
        {canEdit ? (
          <ProductForm
            productId={id}
            choices={choices}
            showCosts={showCosts}
            defaults={{
              sku: product.sku, barcode: product.barcode ?? "", nameEn: product.name_en, nameUr: product.name_ur ?? "", categoryId: product.category_id ?? "",
              brandId: product.brand_id ?? "", supplierId: product.default_supplier_id ?? "", baseUnitId: product.base_unit_id,
              salePrice: base?.salePrice ?? "", purchasePrice: base?.purchasePrice ?? "", minimumStock: String(product.reorder_level),
              taxRate: String(product.tax_rate), isActive: product.is_active, notes: product.notes ?? "",
              units: product.units.filter((u) => u.unitId !== product.base_unit_id).map((u) => ({ unitId: u.unitId, factor: String(u.factor), salePrice: u.salePrice, purchasePrice: u.purchasePrice, barcode: u.barcode })),
            }}
          />
        ) : (
          <SectionCard title={t.catalog.details}>
            <DescriptionList
              items={[
                { label: t.catalog.nameEn, value: product.name_en },
                { label: t.catalog.nameUr, value: product.name_ur && <span lang="ur" dir="rtl">{product.name_ur}</span> },
                { label: t.catalog.barcode, value: product.barcode && <Ltr>{product.barcode}</Ltr> },
                { label: t.catalog.category, value: label(choices.categories, product.category_id) },
                { label: t.catalog.brand, value: label(choices.brands, product.brand_id) },
                { label: t.catalog.supplier, value: label(choices.suppliers, product.default_supplier_id) },
                { label: t.catalog.minimumStock, value: formatNumber(product.reorder_level, locale) },
                ...product.units.map((u) => ({
                  label: `${label(choices.units, u.unitId) ?? "—"}${u.factor > 1 ? ` (${u.factor})` : ""}`,
                  value: u.salePrice ? <Ltr>{formatPaisa(toPaisa(u.salePrice), locale)}</Ltr> : null,
                })),
              ]}
            />
          </SectionCard>
        )}
      </div>
    </>
  );
}

async function StockByWarehouse({ productId }: { productId: string }) {
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const supabase = await createClient();
  const [balances, units] = await Promise.all([
    supabase.from("stock_balances").select("on_hand, reserved, warehouse:warehouses!stock_balances_warehouse_id_fkey(id, name_en, name_ur)").eq("product_id", productId),
    supabase.from("product_units").select("factor, unit:units!product_units_unit_id_fkey(name_en, name_ur)").eq("product_id", productId).eq("is_active", true),
  ]);
  if (balances.error) throw balances.error;
  if (units.error) throw units.error;
  const rows = balances.data.filter((b) => b.on_hand !== 0 || b.reserved !== 0);
  const parts = (n: number) => breakdown(BigInt(n), units.data.map((u) => ({ name: locale === "ur" ? u.unit.name_ur : u.unit.name_en, factor: BigInt(u.factor) })))
    .map((p) => `${formatNumber(p.count, locale)} ${p.name}`).join(" + ");
  return (
    <SectionCard title={t.catalog.stock}>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t.stock.emptyStock}</p> : (
        <ul className="divide-y">
          {rows.map((b) => (
            <li key={b.warehouse.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-2.5 text-sm first:pt-0 last:pb-0">
              <span className="font-medium">{locale === "ur" && b.warehouse.name_ur ? b.warehouse.name_ur : b.warehouse.name_en}</span>
              <span className="text-end">
                <span className="font-semibold tabular-nums">{formatNumber(b.on_hand, locale)}</span>
                {b.on_hand > 0 && units.data.length > 1 && <span className="text-muted-foreground"> · {parts(b.on_hand)}</span>}
                {b.reserved > 0 && <span className="text-muted-foreground"> · {t.stock.reserved}: {formatNumber(b.reserved, locale)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
