import type { Metadata } from "next";
import { seesAllCollections } from "@/features/receivables/queries";
import { PAYMENT_METHODS } from "@/features/receivables/schema";
import { REPORTS } from "@/features/reports/catalog";
import { reportPage } from "@/features/reports/page-context";
import { reportCollections } from "@/features/reports/queries";
import { loadTakers } from "@/features/takers/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { uuidParam } from "@/lib/page-context";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSelect } from "@/components/tables/url-filters";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).reports.collections };
}

export default async function CollectionReportPage({ searchParams }: PageProps<"/reports/collections">) {
  const { ctx, t, query, today, period, allowed, local } = await reportPage(REPORTS.collections, searchParams);
  const all = seesAllCollections(ctx);
  if (!allowed || (!all && !can(ctx, "receivables.collect"))) return <Forbidden />;
  const r = t.reports;
  const c = t.receivables;
  const method = PAYMENT_METHODS.find((m) => m === query.method) ?? null;
  const [rows, takers] = await Promise.all([reportCollections(period, uuidParam(query.taker), method), all ? loadTakers() : []]);
  return (
    <>
      <PageHeader title={r.collections} breadcrumbs={[{ label: r.title, href: "/reports" }]} />
      <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={r.collections} description={r.collectionsHint}>
        <SpecTable
          caption={r.collections}
          exportName={`collections-${period.from}-${period.to}`}
          rows={rows.map((x) => ({
            id: x.payment_id, no: x.doc_no, noHref: `/receivables/payments/${x.payment_id}`, date: x.payment_date, customer: local(x.customer, x.customer_ur), method: t.purchasing.methods[x.method], reference: x.reference,
            collector: x.collector_en ? local(x.collector_en, x.collector_ur) : null, destination: x.held ? c.heldByTaker : x.destination, invoices: x.invoices, amount: x.amount, settled: x.settled, onAccount: x.on_account,
          }))}
          columns={[
            { key: "no", sub: "reference", label: t.documents.number, kind: "link", primary: true },
            { key: "date", label: t.documents.date, kind: "date" },
            { key: "customer", label: t.sales.customer, kind: "text" },
            { key: "method", label: c.method, kind: "text", hideBelow: "lg" },
            { key: "collector", label: c.collectedBy, kind: "text", hideBelow: "xl" },
            { key: "destination", label: c.destination, kind: "text", hideBelow: "2xl" },
            { key: "invoices", label: r.invoices, kind: "code", hideBelow: "2xl" },
            { key: "amount", label: c.amount, kind: "money", total: true },
            { key: "settled", label: c.settled, kind: "money", hideBelow: "lg", total: true },
            { key: "onAccount", label: c.onAccount, kind: "money", hideBelow: "xl", total: true },
          ]}
          searchKeys={["no", "reference", "customer", "collector", "invoices"]}
          toolbar={
            <>
              <UrlSelect param="method" label={c.allMethods} options={PAYMENT_METHODS.map((m) => ({ value: m, label: t.purchasing.methods[m] }))} />
              {takers.length > 0 && <UrlSelect param="taker" label={t.customers.allOrderTakers} options={takers.map((x) => ({ value: x.id, label: local(x.nameEn, x.nameUr) }))} />}
            </>
          }
          empty={{ title: r.empty, description: r.emptyHint }}
        />
      </PeriodFrame>
    </>
  );
}
