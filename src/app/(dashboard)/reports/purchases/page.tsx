import type { Metadata } from "next";
import { flowOf, flowPath } from "@/features/purchasing/flow";
import { uuidParam } from "@/features/inventory/page-context";
import { REPORTS } from "@/features/reports/catalog";
import { reportPage } from "@/features/reports/page-context";
import { loadSupplierChoices, reportPurchases } from "@/features/reports/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSelect } from "@/components/tables/url-filters";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).reports.purchases };
}

export default async function PurchaseReportPage({ searchParams }: PageProps<"/reports/purchases">) {
  const { ctx, t, query, today, period, allowed, local } = await reportPage(REPORTS.purchases, searchParams);
  if (!allowed) return <Forbidden />;
  const p = t.purchasing;
  const r = t.reports;
  const principal = query.source === "company" ? true : query.source === "external" ? false : null;
  const [rows, suppliers] = await Promise.all([reportPurchases(period, uuidParam(query.supplier), principal), can(ctx, "suppliers.view") ? loadSupplierChoices() : []]);
  const account = can(ctx, "payables.view") || can(ctx, "company.view");
  return (
    <>
      <PageHeader title={r.purchases} breadcrumbs={[{ label: r.title, href: "/reports" }]} />
      <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={r.purchases} description={r.purchasesHint}>
        <SpecTable
          caption={r.purchases}
          exportName={`purchases-${period.from}-${period.to}`}
          rows={rows.map((x) => ({
            id: x.goods_receipt_id, no: x.doc_no, noHref: flowPath(flowOf(x.is_principal), "receipts", x.goods_receipt_id), order: x.order_no, date: x.receipt_date, supplier: local(x.supplier_en, x.supplier_ur),
            ordered: x.ordered_base, received: x.received_base, accepted: x.accepted_base, damaged: x.damaged_base, rejected: x.rejected_base,
            cost: x.total_cost, bill: x.invoice_no, paid: x.paid_amount, remaining: x.remaining,
          }))}
          columns={[
            { key: "no", sub: "order", label: p.receipt, kind: "link", primary: true },
            { key: "date", label: t.documents.date, kind: "date" },
            { key: "supplier", label: t.documents.supplier, kind: "text" },
            { key: "ordered", label: p.ordered, kind: "quantity", hideBelow: "2xl" },
            { key: "received", label: p.received, kind: "quantity", hideBelow: "xl", total: true },
            { key: "accepted", label: p.accepted, kind: "quantity", hideBelow: "lg", total: true },
            { key: "damaged", label: p.damaged, kind: "quantity", hideBelow: "lg", total: true },
            { key: "rejected", label: p.rejected, kind: "quantity", hideBelow: "2xl", total: true },
            { key: "cost", label: t.catalog.purchaseCost, kind: "money", total: true },
            { key: "bill", label: p.billNumber, kind: "code", hideBelow: "2xl" },
            ...(account ? [
              { key: "paid", label: p.paid, kind: "money" as const, hideBelow: "lg" as const, total: true },
              { key: "remaining", label: p.outstanding, kind: "money" as const, total: true },
            ] : []),
          ]}
          searchKeys={["no", "order", "supplier", "bill"]}
          toolbar={
            <>
              <UrlSelect param="source" label={r.allSources} options={[{ value: "company", label: r.company }, { value: "external", label: r.external }]} />
              {suppliers.length > 0 && <UrlSelect param="supplier" label={t.suppliers.title} options={suppliers.map((s) => ({ value: s.id, label: local(s.name, s.name_ur) }))} />}
            </>
          }
          empty={{ title: r.empty, description: r.emptyHint }}
        />
      </PeriodFrame>
    </>
  );
}
