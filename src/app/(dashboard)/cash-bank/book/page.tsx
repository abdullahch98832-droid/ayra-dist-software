import type { Metadata } from "next";
import { documentHref } from "@/features/documents/kinds";
import { loadAccountBook, loadPaymentAccounts, reportCashAccounts } from "@/features/cash-bank/queries";
import { businessToday, parsePeriod } from "@/features/dashboard/period";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext, uuidParam } from "@/lib/page-context";
import { LedgerTable } from "@/components/accounting/ledger-table";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/states";
import { UrlSelect } from "@/components/tables/url-filters";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).cashBank.tabs.book };
}

export default async function AccountBookPage({ searchParams }: PageProps<"/cash-bank/book">) {
  const { ctx, t, local } = await pageContext();
  if (!can(ctx, "cash_bank.view") && !can(ctx, "accounting.view")) return <Forbidden />;
  const c = t.cashBank;
  const query = await searchParams;
  const today = businessToday();
  const period = parsePeriod(query, today);
  const accounts = can(ctx, "cash_bank.view") ? await loadPaymentAccounts() : (await reportCashAccounts(today, today)).map((a) => ({ id: a.account_id, name: a.name, type: a.account_type, masked: null, isActive: a.is_active }));
  const wanted = uuidParam(query.account);
  const kind = query.kind === "cash" || query.kind === "bank" ? query.kind : null;
  const account = accounts.find((a) => a.id === wanted) ?? accounts.find((a) => !kind || a.type === kind) ?? null;
  const lines = account ? await loadAccountBook(account.id, period.from, period.to) : [];
  const title = account ? `${account.type === "cash" ? c.cashBook : c.bankBook}: ${account.name}` : c.tabs.book;
  return (
    <>
      <PageHeader title={title} />
      {!account ? <EmptyState title={c.empty} description={c.emptyHint} /> : (
        <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={account.type === "cash" ? c.cashBook : c.bankBook} description={account.name}>
          <LedgerTable t={t} local={local} lines={lines} caption={title} exportName={`book-${account.name}-${period.from}-${period.to}`} pdfHref={documentHref(account.type === "cash" ? "cash_book" : "bank_book", { account: account.id, range: "custom", from: period.from, to: period.to })} debitLabel={c.moneyIn} creditLabel={c.moneyOut} canOpen={can(ctx, "accounting.view")}
            toolbar={accounts.length > 1 && <UrlSelect param="account" label={c.chooseAccount} options={accounts.map((a) => ({ value: a.id, label: a.name }))} />} />
        </PeriodFrame>
      )}
    </>
  );
}
