import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadCashDay, loadPaymentAccounts } from "@/features/cash-bank/queries";
import { businessToday } from "@/features/dashboard/period";
import { fill, isolate } from "@/i18n/format";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext, uuidParam } from "@/lib/page-context";
import { toDbAmount, toPaisa } from "@/lib/utils/money";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { formatDate } from "@/components/shared/format";
import { UrlDate } from "@/components/tables/url-filters";
import { ClosingForm } from "./closing-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).cashBank.closeDay };
}

export default async function NewClosingPage({ searchParams }: PageProps<"/cash-bank/closing/new">) {
  const { ctx, t, locale } = await pageContext();
  if (!can(ctx, "cash_bank.close") || !can(ctx, "cash_bank.view")) return <Forbidden />;
  const c = t.cashBank;
  const query = await searchParams;
  const today = businessToday();
  const date = typeof query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.date) && query.date <= today ? query.date : today;
  const account = (await loadPaymentAccounts()).find((a) => a.id === uuidParam(query.account) && a.type === "cash");
  if (!account) notFound();
  const day = await loadCashDay(account.id, date);
  if (!day) notFound();
  const amount = (n: number) => toDbAmount(toPaisa(n));
  return (
    <>
      <PageHeader
        title={`${c.closeDay}: ${account.name}`} breadcrumbs={[{ label: c.closingTitle, href: "/cash-bank/closing" }]}
        description={day.opened_after ? fill(c.openedAfter, { date: isolate(formatDate(day.opened_after, locale) ?? "") }) : c.neverClosed}
        actions={<UrlDate param="date" label={c.closingDate} max={today} fallback={today} />}
      />
      <ClosingForm
        key={date} day={{ opening: amount(day.opening), receipts: amount(day.receipts), payments: amount(day.payments), expected: amount(day.expected) }}
        defaults={{ accountId: account.id, date, counted: "", notes: "", postDifference: false, denominations: {}, requestId: crypto.randomUUID() }}
      />
    </>
  );
}
