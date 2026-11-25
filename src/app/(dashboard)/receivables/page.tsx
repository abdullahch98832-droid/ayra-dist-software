import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Banknote, Clock, HandCoins, History, Wallet } from "lucide-react";
import { businessToday } from "@/features/dashboard/period";
import { countWaitingPayments, loadCash, loadReceivables } from "@/features/receivables/queries";
import { loadTakers } from "@/features/takers/queries";
import { fill } from "@/i18n/format";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext, uuidParam } from "@/lib/page-context";
import { formatPaisa, sumPaisa, toPaisa } from "@/lib/utils/money";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr } from "@/components/shared/bidi";
import { formatNumber } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { StatCard } from "@/components/shared/stat-card";
import { StatGrid } from "@/components/shared/stat-grid";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSelect } from "@/components/tables/url-filters";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).receivables.title };
}

const ZERO = BigInt(0);

export default async function ReceivablesPage({ searchParams }: PageProps<"/receivables">) {
  const { ctx, t, locale, local } = await pageContext();
  if (!can(ctx, "receivables.view")) redirect(can(ctx, "receivables.collect") ? "/receivables/payments" : "/receivables/notes");
  const r = t.receivables;
  const takerId = uuidParam((await searchParams).taker);
  const all = can(ctx, "sales.view_all") || can(ctx, "customers.manage");
  const [rows, waiting, cash, takers] = await Promise.all([
    can(ctx, "sales.view") || can(ctx, "sales.view_all") ? loadReceivables(businessToday(), takerId) : [], countWaitingPayments(),
    can(ctx, "receivables.post") || can(ctx, "receivables.collect") || can(ctx, "sales.view_all") ? loadCash() : [], all ? loadTakers() : [],
  ]);
  const sum = (key: "balance" | "overdue" | "older" | "advance") => sumPaisa(rows.map((x) => toPaisa(x[key])));
  const money = (v: bigint) => <Ltr>{formatPaisa(v, locale)}</Ltr>;
  const held = sumPaisa(cash.map((c) => toPaisa(c.held)));
  const owed = sumPaisa(rows.map((x) => toPaisa(x.balance)).filter((v) => v > ZERO));
  return (
    <>
      <PageHeader
        title={r.title} description={r.subtitle}
        actions={can(ctx, "receivables.collect") && <LinkButton href="/receivables/payments/new"><Banknote aria-hidden />{r.newPayment}</LinkButton>}
      />
      <div className="grid gap-6">
        <StatGrid>
          <StatCard label={r.total} value={money(owed)} icon={HandCoins} hint={sum("advance") > ZERO ? <>{r.advances}: {money(sum("advance"))}</> : undefined} />
          <StatCard label={r.overdue} value={money(sum("overdue"))} icon={Clock} tone={sum("overdue") > ZERO ? "attention" : "default"} href="/sales/invoices?status=overdue" />
          <StatCard label={r.over90} value={money(sum("older"))} icon={History} tone={sum("older") > ZERO ? "attention" : "default"} />
          <StatCard label={r.totalHeld} value={money(held)} icon={Wallet} tone={held > ZERO ? "attention" : "default"} href="/receivables/cash" />
          <StatCard label={r.waiting} value={formatNumber(waiting, locale)} icon={Banknote} tone={waiting ? "attention" : "default"} hint={fill(r.waitingHint, { count: formatNumber(waiting, locale) })} href="/receivables/payments?status=draft" />
        </StatGrid>
        <SpecTable
          caption={r.tabs.overview}
          rows={rows.map((x) => ({
            id: x.customer_id, name: local(x.name, x.name_ur), nameHref: `/customers/${x.customer_id}`, code: x.code, city: [x.area, x.city].filter(Boolean).join(", "), taker: x.taker_en ? local(x.taker_en, x.taker_ur) : null,
            a: x.days_30, b: x.days_60, c: x.days_90, o: x.older, balance: x.balance, overdue: x.overdue, last: x.last_payment,
            pay: can(ctx, "receivables.collect") && toPaisa(x.balance) > ZERO ? r.newPayment : null, payHref: `/receivables/payments/new?customer=${x.customer_id}`,
          }))}
          columns={[
            { key: "name", sub: "code", label: t.customers.name, kind: "link", primary: true },
            { key: "city", label: t.customers.city, kind: "text", hideBelow: "2xl" },
            ...(all ? [{ key: "taker", label: t.customers.orderTaker, kind: "text" as const, hideBelow: "2xl" as const }] : []),
            { key: "a", label: r.ages.days_30, kind: "money", hideBelow: "lg", total: true },
            { key: "b", label: r.ages.days_60, kind: "money", hideBelow: "lg", total: true },
            { key: "c", label: r.ages.days_90, kind: "money", hideBelow: "xl", total: true },
            { key: "o", label: r.ages.older, kind: "money", hideBelow: "xl", total: true },
            { key: "balance", label: t.customers.balance, kind: "money", total: true },
            { key: "last", label: t.customers.lastPayment, kind: "date", hideBelow: "2xl" },
            ...(can(ctx, "receivables.collect") ? [{ key: "pay", label: t.purchasing.payment, kind: "link" as const, hideBelow: "lg" as const }] : []),
          ]}
          searchKeys={["name", "code", "city", "taker"]}
          searchPlaceholder={t.customers.searchPlaceholder}
          toolbar={takers.length > 0 && <UrlSelect param="taker" label={t.customers.allOrderTakers} options={takers.map((x) => ({ value: x.id, label: local(x.nameEn, x.nameUr) }))} />}
          empty={{ title: r.outstandingEmpty }}
        />
      </div>
    </>
  );
}
