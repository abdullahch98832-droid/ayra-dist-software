import type { Metadata } from "next";
import { documentHref } from "@/features/documents/kinds";
import { loadChart, loadGeneralLedger, seesLedgers } from "@/features/accounting/queries";
import { businessToday, parsePeriod } from "@/features/dashboard/period";
import { getT } from "@/i18n/server";
import { pageContext, uuidParam } from "@/lib/page-context";
import { LedgerTable } from "@/components/accounting/ledger-table";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { UrlSelect } from "@/components/tables/url-filters";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).accounting.tabs.ledger };
}

export default async function GeneralLedgerPage({ searchParams }: PageProps<"/accounting/ledger">) {
  const { ctx, t, local } = await pageContext();
  if (!seesLedgers(ctx)) return <Forbidden />;
  const a = t.accounting;
  const query = await searchParams;
  const today = businessToday();
  const period = parsePeriod(query, today);
  const accounts = (await loadChart()).filter((x) => x.is_postable);
  const account = accounts.find((x) => x.id === uuidParam(query.account)) ?? accounts.find((x) => x.system_key === "SALES") ?? accounts[0];
  const lines = account ? await loadGeneralLedger(account.id, period.from, period.to) : [];
  const title = account ? `${account.code} ${local(account.name_en, account.name_ur)}` : a.tabs.ledger;
  return (
    <>
      <PageHeader title={a.tabs.ledger} />
      <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={title} description={account ? a.types[account.account_type] : ""}>
        <LedgerTable t={t} local={local} lines={lines} caption={title} exportName={`ledger-${account?.code}-${period.from}-${period.to}`} pdfHref={documentHref("general_ledger", { account: account?.id, range: "custom", from: period.from, to: period.to })} debitLabel={a.debit} creditLabel={a.credit} canOpen
          toolbar={<UrlSelect param="account" label={a.allAccounts} className="sm:w-72" options={accounts.map((x) => ({ value: x.id, label: `${x.code} · ${local(x.name_en, x.name_ur)}` }))} />} />
      </PeriodFrame>
    </>
  );
}
