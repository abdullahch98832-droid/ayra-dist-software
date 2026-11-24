import type { Metadata } from "next";
import { loadChart } from "@/features/accounting/queries";
import { loadAllCategories } from "@/features/expenses/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { CategoriesTable } from "./categories-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).expenses.tabs.categories };
}

export default async function CategoriesPage() {
  const { ctx, t } = await pageContext();
  if (!can(ctx, "expenses.post")) return <Forbidden />;
  const [categories, chart] = await Promise.all([loadAllCategories(), loadChart()]);
  return (
    <>
      <PageHeader title={t.expenses.tabs.categories} description={t.expenses.categoriesHint} />
      <CategoriesTable categories={categories} accounts={chart.filter((a) => a.account_type === "expense" && a.is_postable && a.is_active)} />
    </>
  );
}
