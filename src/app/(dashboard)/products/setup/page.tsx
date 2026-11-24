import type { Metadata } from "next";
import { saveBrandAction, saveCategoryAction, saveUnitAction } from "@/features/catalog/actions";
import { getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { ListEditor } from "./list-editor";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).catalog.setup };
}

export default async function ProductSetupPage() {
  const ctx = await requireActiveSession();
  if (!can(ctx, "products.manage")) return <Forbidden />;
  const t = await getT();
  const supabase = await createClient();
  const [categories, brands, units] = await Promise.all([
    supabase.from("product_categories").select("id, name_en, name_ur, is_active").order("name_en"),
    supabase.from("brands").select("id, name_en, name_ur, is_active").order("name_en"),
    supabase.from("units").select("id, code, name_en, name_ur, is_active").order("code"),
  ]);
  for (const r of [categories, brands, units]) if (r.error) throw r.error;
  const item = (r: { id: string; code?: string; name_en: string; name_ur: string | null; is_active: boolean }) => ({ id: r.id, code: r.code, nameEn: r.name_en, nameUr: r.name_ur, isActive: r.is_active });
  return (
    <>
      <PageHeader title={t.catalog.setup} description={t.catalog.setupHint} breadcrumbs={[{ label: t.catalog.title, href: "/products" }]} />
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <ListEditor title={t.catalog.categories} items={(categories.data ?? []).map(item)} action={saveCategoryAction} />
        <ListEditor title={t.catalog.brands} items={(brands.data ?? []).map(item)} action={saveBrandAction} />
        <ListEditor title={t.catalog.unitList} withCode items={(units.data ?? []).map(item)} action={saveUnitAction} />
      </div>
    </>
  );
}
