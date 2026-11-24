import type { Metadata } from "next";
import { PackageCheck } from "lucide-react";
import { flowPath } from "@/features/purchasing/flow";
import { purchasingPage } from "@/features/purchasing/page-context";
import { loadFlowSuppliers, loadReceipts } from "@/features/purchasing/queries";
import { can } from "@/lib/auth/session";
import { LIST_PAGE, listParams } from "@/lib/list-params";
import { ListFilters } from "@/components/documents/list-filters";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/shared/link-button";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSelect } from "@/components/tables/url-filters";

const STATUSES = ["draft", "posted"] as const;

export async function generateMetadata({ params }: PageProps<"/purchasing/[flow]/receipts">): Promise<Metadata> {
  return { title: (await purchasingPage(params)).t.purchasing.tabs.receipts };
}

export default async function ReceiptsPage({ params, searchParams }: PageProps<"/purchasing/[flow]/receipts">) {
  const { flow, ctx, t, local } = await purchasingPage(params);
  const p = t.purchasing;
  const filter = listParams(await searchParams, STATUSES);
  const [{ rows: receipts, total }, suppliers] = await Promise.all([loadReceipts(flow, filter), flow === "suppliers" ? loadFlowSuppliers(flow, true) : []]);
  const add = can(ctx, "purchasing.create") && <LinkButton href={flowPath(flow, "receipts", "new")}><PackageCheck aria-hidden />{p.newReceipt}</LinkButton>;
  return (
    <>
      <PageHeader title={p.tabs.receipts} description={p.flows[flow]} actions={add} />
      <SpecTable
        caption={p.tabs.receipts}
        rows={receipts.map((r) => ({
          id: r.id, no: r.doc_no, noHref: flowPath(flow, "receipts", r.id), date: r.receipt_date, supplier: local(r.supplier.name, r.supplier.name_ur),
          order: r.order?.doc_no, reference: r.supplier_reference, status: r.status, total: r.total_amount,
          billed: r.status === "posted" && r.total_amount > 0 ? (r.supplier_invoice_receipts ? "yes" : "no") : null,
        }))}
        columns={[
          { key: "no", label: t.documents.number, kind: "link", primary: true },
          ...(flow === "suppliers" ? [{ key: "supplier", label: t.documents.supplier, kind: "text" as const }] : []),
          { key: "date", label: t.documents.date, kind: "date" },
          { key: "order", label: p.againstOrder, kind: "code", hideBelow: "lg" },
          { key: "reference", label: p.supplierReference, kind: "code", hideBelow: "xl" },
          { key: "total", label: t.documents.total, kind: "money" },
          { key: "billed", label: p.bill, kind: "status", hideBelow: "lg", options: { yes: { label: p.billed, tone: "green" }, no: { label: p.notBilled, tone: "amber" } } },
          { key: "status", label: t.common.status, kind: "status", options: { draft: { label: p.statuses.draft, tone: "gray" }, posted: { label: p.statuses.posted, tone: "green" } } },
        ]}
        server={{ page: filter.page, pageSize: LIST_PAGE, total }}
        toolbar={<ListFilters t={t} local={local} suppliers={suppliers}><UrlSelect param="status" label={t.documents.allStatuses} options={STATUSES.map((s) => ({ value: s, label: p.statuses[s] }))} /></ListFilters>}
        empty={{ title: t.documents.empty, description: t.documents.emptyHint, action: add }}
      />
    </>
  );
}
