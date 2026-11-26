import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Banknote, Coins, WalletCards } from "lucide-react";
import { loadPaymentAccounts } from "@/features/cash-bank/queries";
import { loadExtraPayments } from "@/features/company-extra/queries";
import { businessToday, parsePeriod } from "@/features/dashboard/period";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { formatPaisa, sumPaisa, toPaisa } from "@/lib/utils/money";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { DocumentLink } from "@/components/documents/document-link";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr } from "@/components/shared/bidi";
import { StatCard } from "@/components/shared/stat-card";
import { StatGrid } from "@/components/shared/stat-grid";
import { ExtraPayments } from "./extra-payments";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).supply.extra.title };
}

export default async function ExtraPaymentsPage({ params, searchParams }: PageProps<"/purchasing/[flow]/extra-payments">) {
  const { flow } = await params;
  if (flow !== "company") notFound();
  const { ctx, t, locale } = await pageContext();
  if (!can(ctx, "company.view")) return <Forbidden />;
  const x = t.supply.extra;
  const today = businessToday();
  const period = parsePeriod(await searchParams, today);
  const pay = can(ctx, "company.pay");
  const [rows, accounts] = await Promise.all([loadExtraPayments(period), pay ? loadPaymentAccounts() : []]);
  const live = rows.filter((r) => !r.isVoid);
  const sum = (pick: (r: (typeof live)[number]) => boolean) => <Ltr>{formatPaisa(sumPaisa(live.filter(pick).map((r) => toPaisa(r.amount))), locale)}</Ltr>;
  return (
    <>
      <PageHeader title={x.title} description={x.hint} actions={can(ctx, "reports.export") && <DocumentLink kind="report" params={{ report: "company-extra", table: "payments", range: "custom", from: period.from, to: period.to }} label={t.docs.pdf} />} />
      <PeriodFrame compact key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={x.title} description={x.reportHint}>
        <StatGrid>
          <StatCard label={x.received} value={sum((r) => r.direction === "in")} icon={Banknote} />
          <StatCard label={x.extraTotal} value={sum((r) => r.direction === "out" && r.kind === "extra")} icon={Coins} />
          <StatCard label={x.accountTotal} value={sum((r) => r.direction === "out" && r.kind === "account")} icon={WalletCards} />
        </StatGrid>
        <ExtraPayments rows={rows} pay={pay} today={today} accounts={accounts.map((a) => ({ id: a.id, name: a.masked ? `${a.name} · ${a.masked}` : a.name, isActive: a.isActive }))} />
      </PeriodFrame>
    </>
  );
}
