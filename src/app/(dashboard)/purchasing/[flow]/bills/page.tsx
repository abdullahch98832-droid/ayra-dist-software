import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { flowPath } from "@/features/purchasing/flow";
import { purchasingPage } from "@/features/purchasing/page-context";
import { loadBills, loadFlowSuppliers, seesAccount } from "@/features/purchasing/queries";
import { can } from "@/lib/auth/session";
import { LIST_PAGE, listParams } from "@/lib/list-params";
import { ListFilters } from "@/components/documents/list-filters";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/shared/link-button";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSelect } from "@/components/tables/url-filters";

const STATUSES = ["draft", "posted"] as const;

export async function generateMetadata({ params }: PageProps<"/purchasing/[flow]/bills">): Promise<Metadata> {
  return { title: (await purchasingPage(params)).t.purchasing.tabs.bills };
}

export default async function BillsPage({ params, searchParams }: PageProps<"/purchasing/[flow]/bills">) {
  const { flow, ctx, t, local } = await purchasingPage(params);
  const p = t.purchasing;
  const account = seesAccount(ctx, flow);
  const filter = listParams(await searchParams, account ? [...STATUSES, "unpaid"] : STATUSES);
  const [{ rows: bills, total }, suppliers] = await Promise.all([loadBills(flow, filter), flow === "suppliers" ? loadFlowSuppliers(flow, true) : []]);
  const add = can(ctx, "purchasing.create") && <LinkButton href={flowPath(flow, "bills", "new")}><Plus aria-hidden />{p.newBill}</LinkButton>;
  return (
    <>
      <PageHeader title={p.tabs.bills} description={p.flows[flow]} actions={add} />
      <SpecTable
        caption={p.tabs.bills}
        rows={bills.map((b) => ({
          id: b.supplier_invoice_id ?? "", no: b.invoice_number, noHref: flowPath(flow, "bills", b.supplier_invoice_id ?? ""), doc: b.doc_no, supplier: local(b.supplier_name ?? "", b.supplier_name_ur),
          date: b.invoice_date, due: b.due_date, amount: b.amount, paid: b.paid_amount, outstanding: b.outstanding,
          status: b.status === "draft" || b.outstanding === null ? b.status : b.outstanding <= 0 ? "paid" : (b.paid_amount ?? 0) > 0 ? "partly" : "unpaid",
        }))}
        columns={[
          { key: "no", sub: "doc", label: p.billNumber, kind: "link", primary: true },
          ...(flow === "suppliers" ? [{ key: "supplier", label: t.documents.supplier, kind: "text" as const }] : []),
          { key: "date", label: p.billDate, kind: "date" },
          { key: "due", label: p.dueDate, kind: "date", hideBelow: "xl" },
          { key: "amount", label: p.amount, kind: "money" },
          ...(account ? [
            { key: "paid", label: p.paid, kind: "money" as const, hideBelow: "lg" as const },
            { key: "outstanding", label: p.outstanding, kind: "money" as const },
          ] : []),
          { key: "status", label: t.common.status, kind: "status", options: {
            draft: { label: p.statuses.draft, tone: "gray" }, posted: { label: p.statuses.posted, tone: "green" }, void: { label: p.statuses.void, tone: "red" },
            unpaid: { label: p.payStatuses.unpaid, tone: "red" }, partly: { label: p.payStatuses.partly, tone: "amber" }, paid: { label: p.payStatuses.paid, tone: "green" },
          } },
        ]}
        server={{ page: filter.page, pageSize: LIST_PAGE, total }}
        toolbar={<ListFilters t={t} local={local} suppliers={suppliers}><UrlSelect param="status" label={t.documents.allStatuses} options={[...STATUSES.map((s) => ({ value: s, label: p.statuses[s] })), ...(account ? [{ value: "unpaid", label: p.payStatuses.unpaid }] : [])]} /></ListFilters>}
        empty={{ title: t.documents.empty, description: t.documents.emptyHint, action: add }}
      />
    </>
  );
}
