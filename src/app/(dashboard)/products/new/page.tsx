import type { Metadata } from "next";
import { loadProductChoices } from "@/features/catalog/queries";
import { getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { ProductForm } from "../product-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).catalog.add };
}

export default async function NewProductPage() {
  const ctx = await requireActiveSession();
  if (!can(ctx, "products.manage")) return <Forbidden />;
  const supabase = await createClient();
  const [t, choices, piece] = await Promise.all([
    getT(), loadProductChoices(ctx), supabase.from("units").select("id").eq("code", "PCS").maybeSingle(),
  ]);
  return (
    <>
      <PageHeader title={t.catalog.add} breadcrumbs={[{ label: t.catalog.title, href: "/products" }]} />
      <ProductForm
        productId={null}
        choices={choices}
        showCosts={can(ctx, "costs.view")}
        defaults={{
          sku: "", barcode: "", nameEn: "", nameUr: "", categoryId: "", brandId: "", supplierId: "", baseUnitId: piece.data?.id ?? "",
          salePrice: "", purchasePrice: "", minimumStock: "", taxRate: "", isActive: true, notes: "", units: [],
        }}
      />
    </>
  );
}
