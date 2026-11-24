import type { Metadata } from "next";
import { businessToday } from "@/features/dashboard/period";
import { seesSettlements } from "@/features/sales/access";
import { loadInvoices } from "@/features/sales/queries";
import { payOptions } from "@/features/sales/status";
import { getT } from "@/i18n/server";
import { LIST_PAGE, listParams } from "@/lib/list-params";
import { pageContext, uuidParam } from "@/lib/page-context";
import { PageHeader } from "@/components/layout/page-header";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSearch, UrlSelect } from "@/components/tables/url-filters";

const STATUSES = ["unpaid", "partially_paid", "paid"] as const;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).sales.tabs.invoices };
}

export default async function InvoicesPage({ searchParams }: PageProps<"/sales/invoices">) {
  const { ctx, t, local } = await pageContext();
  const settlements = seesSettlements(ctx);
  const s = t.sales;
  const query = await searchParams;
  const filter = { ...listParams(query, [...STATUSES, "overdue"]), customerId: uuidParam(query.customer), takerId: uuidParam(query.taker) };
  const { rows, total } = await loadInvoices(filter, businessToday());
  return (
    <>
      <PageHeader title={s.tabs.invoices} />
      <SpecTable
        caption={s.tabs.invoices}
        rows={rows.map((i) => ({
          id: i.sales_invoice_id ?? "", no: i.doc_no, noHref: `/sales/invoices/${i.sales_invoice_id}`, customer: i.customer ? local(i.customer.name, i.customer.name_ur) : null, date: i.invoice_date, due: i.due_date,
          total: i.total_amount, paid: i.paid_amount, returned: i.returned_amount, outstanding: i.outstanding, status: i.payment_status,
        }))}
        columns={[
          { key: "no", label: s.invoiceNo, kind: "link", primary: true },
          { key: "customer", label: s.customer, kind: "text" },
          { key: "date", label: s.invoiceDate, kind: "date" },
          { key: "due", label: s.dueDate, kind: "date", hideBelow: "xl" },
          { key: "total", label: t.documents.total, kind: "money" },
          ...(settlements ? [
            { key: "returned", label: s.returned, kind: "money" as const, hideBelow: "2xl" as const },
            { key: "paid", label: s.paid, kind: "money" as const, hideBelow: "lg" as const },
            { key: "outstanding", label: s.outstanding, kind: "money" as const },
            { key: "status", label: t.common.status, kind: "status" as const, options: payOptions(t) },
          ] : []),
        ]}
        server={{ page: filter.page, pageSize: LIST_PAGE, total }}
        toolbar={<><UrlSearch placeholder={t.documents.searchNumber} />{settlements && <UrlSelect param="status" label={s.allPayStatuses} options={[...STATUSES.map((x) => ({ value: x, label: s.payStatuses[x] })), { value: "overdue", label: s.overdue }]} />}</>}
        empty={{ title: s.invoiceEmpty, description: s.invoiceEmptyHint }}
      />
    </>
  );
}
