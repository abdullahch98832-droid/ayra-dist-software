import type { Metadata } from "next";
import { loadBalances, loadChart, seesLedgers } from "@/features/accounting/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { ChartTable } from "./chart-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).accounting.tabs.accounts };
}

export default async function ChartPage() {
  const { ctx, t } = await pageContext();
  if (!seesLedgers(ctx)) return <Forbidden />;
  const [chart, balances] = await Promise.all([loadChart(), loadBalances(ctx)]);
  return (
    <>
      <PageHeader title={t.accounting.tabs.accounts} description={t.accounting.accountHint} />
      <ChartTable accounts={chart.map((a) => ({ ...a, balance: balances.get(a.id) ?? 0 }))} manage={can(ctx, "accounting.manage")} />
    </>
  );
}
