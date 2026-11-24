import type { Metadata } from "next";
import { Plus, SearchX, Settings2 } from "lucide-react";
import { loadProductChoices, loadProductList, PRODUCT_LIMIT } from "@/features/catalog/queries";
import { fill } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { FormAlert } from "@/components/forms/field";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { formatNumber } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { UrlSearch, UrlSelect } from "@/components/tables/url-filters";
import { ProductsTable } from "./products-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).catalog.title };
}

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const ctx = await requireActiveSession();
  if (!can(ctx, "products.view")) return <Forbidden />;
  const [t, locale, params] = await Promise.all([getT(), getLocale(), searchParams]);
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const choices = await loadProductChoices(ctx);
  const pick = (value: string, list: { id: string }[]) => (list.some((c) => c.id === value) ? value : "");
  const filter = {
    q: one(params.q), category: pick(one(params.category), choices.categories), brand: pick(one(params.brand), choices.brands),
    status: ["active", "inactive"].includes(one(params.status)) ? one(params.status) : "",
  };
  const rows = await loadProductList(ctx, filter);
  const canManage = can(ctx, "products.manage");
  const add = canManage && <LinkButton href="/products/new"><Plus aria-hidden />{t.catalog.add}</LinkButton>;
  const name = (c: { nameEn: string; nameUr: string | null }) => (locale === "ur" && c.nameUr ? c.nameUr : c.nameEn);

  return (
    <>
      <PageHeader
        title={t.catalog.title}
        description={t.catalog.subtitle}
        actions={canManage && <><LinkButton variant="outline" href="/products/setup"><Settings2 aria-hidden />{t.catalog.setup}</LinkButton>{add}</>}
      />
      <div className="grid gap-4">
        {rows.length === PRODUCT_LIMIT && <FormAlert tone="info">{fill(t.table.truncated, { count: formatNumber(PRODUCT_LIMIT, locale) })}</FormAlert>}
        <ProductsTable
          rows={rows}
          showStock={can(ctx, "inventory.view")}
          toolbar={
            <>
              <UrlSearch placeholder={t.catalog.searchPlaceholder} />
              <UrlSelect param="category" label={t.catalog.allCategories} options={choices.categories.map((c) => ({ value: c.id, label: name(c) }))} />
              <UrlSelect param="brand" label={t.catalog.allBrands} options={choices.brands.map((c) => ({ value: c.id, label: name(c) }))} />
              <UrlSelect param="status" label={t.documents.allStatuses} options={[{ value: "active", label: t.catalog.active }, { value: "inactive", label: t.catalog.inactive }]} />
            </>
          }
          empty={Object.values(filter).some(Boolean)
            ? { title: t.table.noMatches, description: t.table.noMatchesHint, action: <LinkButton variant="outline" href="/products"><SearchX aria-hidden />{t.common.clear}</LinkButton> }
            : { title: t.catalog.empty, description: t.catalog.emptyHint, action: add }}
        />
      </div>
    </>
  );
}
