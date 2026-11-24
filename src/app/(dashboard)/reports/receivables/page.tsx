import type { Metadata } from "next";
import { loadReceivables } from "@/features/receivables/queries";
import { REPORTS } from "@/features/reports/catalog";
import { reportPage } from "@/features/reports/page-context";
import { loadTakers } from "@/features/takers/queries";
import { fill, isolate } from "@/i18n/format";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { uuidParam } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { formatDate } from "@/components/shared/format";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlDate, UrlSelect } from "@/components/tables/url-filters";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).reports.receivables };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function ReceivablesReportPage({ searchParams }: PageProps<"/reports/receivables">) {
  const { ctx, t, locale, query, today, allowed, local } = await reportPage(REPORTS.receivables, searchParams);
  if (!allowed) return <Forbidden />;
  const r = t.reports;
  const ages = t.receivables.ages;
  const asked = typeof query.date === "string" && ISO.test(query.date) && !Number.isNaN(Date.parse(query.date)) ? query.date : today;
  const asOf = asked > today ? today : asked;
  const all = can(ctx, "sales.view_all") || can(ctx, "customers.manage");
  const [rows, takers] = await Promise.all([loadReceivables(asOf, uuidParam(query.taker)), all ? loadTakers() : []]);
  return (
    <>
      <PageHeader title={r.receivables} description={fill(r.asOfHint, { date: isolate(formatDate(asOf, locale) ?? asOf) })} breadcrumbs={[{ label: r.title, href: "/reports" }]} />
      <SpecTable
        caption={r.receivables}
        exportName={`receivables-${asOf}`}
        rows={rows.map((x) => ({
          id: x.customer_id, name: local(x.name, x.name_ur), nameHref: `/customers/${x.customer_id}`, code: x.code, phone: x.phone, city: [x.area, x.city].filter(Boolean).join(", "), taker: x.taker_en ? local(x.taker_en, x.taker_ur) : null,
          limit: x.credit_limit, a: x.days_30, b: x.days_60, c: x.days_90, o: x.older, balance: x.balance, overdue: x.overdue, last: x.last_payment,
        }))}
        columns={[
          { key: "name", sub: "code", label: t.customers.name, kind: "link", primary: true },
          { key: "phone", label: t.customers.phone, kind: "code", hideBelow: "2xl" },
          { key: "city", label: t.customers.city, kind: "text", hideBelow: "2xl" },
          ...(all ? [{ key: "taker", label: t.customers.orderTaker, kind: "text" as const, hideBelow: "2xl" as const }] : []),
          { key: "a", label: ages.days_30, kind: "money", hideBelow: "lg", total: true },
          { key: "b", label: ages.days_60, kind: "money", hideBelow: "lg", total: true },
          { key: "c", label: ages.days_90, kind: "money", hideBelow: "xl", total: true },
          { key: "o", label: ages.older, kind: "money", hideBelow: "xl", total: true },
          { key: "balance", label: t.customers.balance, kind: "money", total: true },
          { key: "overdue", label: t.receivables.overdue, kind: "money", hideBelow: "xl", total: true },
          { key: "limit", label: t.customers.creditLimit, kind: "money", hideBelow: "2xl" },
          { key: "last", label: t.customers.lastPayment, kind: "date", hideBelow: "2xl" },
        ]}
        searchKeys={["name", "code", "city", "taker", "phone"]}
        toolbar={
          <>
            <UrlDate param="date" label={t.receivables.asOf} max={today} fallback={today} />
            {takers.length > 0 && <UrlSelect param="taker" label={t.customers.allOrderTakers} options={takers.map((x) => ({ value: x.id, label: local(x.nameEn, x.nameUr) }))} />}
          </>
        }
        empty={{ title: t.receivables.outstandingEmpty }}
      />
    </>
  );
}
