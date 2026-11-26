import type { Metadata } from "next";
import { Undo2 } from "lucide-react";
import { flowPath } from "@/features/purchasing/flow";
import { purchasingPage } from "@/features/purchasing/page-context";
import { loadFlowSuppliers, loadReturns } from "@/features/purchasing/queries";
import { can } from "@/lib/auth/session";
import { LIST_PAGE, listParams } from "@/lib/list-params";
import { ListFilters } from "@/components/documents/list-filters";
import { DocumentLink } from "@/components/documents/document-link";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/shared/link-button";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSelect } from "@/components/tables/url-filters";

const STATUSES = ["draft", "posted"] as const;

export async function generateMetadata({ params }: PageProps<"/purchasing/[flow]/returns">): Promise<Metadata> {
  return { title: (await purchasingPage(params)).t.purchasing.tabs.returns };
}

export default async function ReturnsPage({ params, searchParams }: PageProps<"/purchasing/[flow]/returns">) {
  const { flow, ctx, t, local } = await purchasingPage(params);
  const p = t.purchasing;
  const filter = listParams(await searchParams, STATUSES);
  const [{ rows: returns, total }, suppliers] = await Promise.all([loadReturns(flow, filter), flow === "suppliers" ? loadFlowSuppliers(flow, true) : []]);
  const add = can(ctx, "purchasing.create") && <LinkButton href={flowPath(flow, "returns", "new")}><Undo2 aria-hidden />{p.newReturn}</LinkButton>;
  return (
    <>
      <PageHeader title={p.tabs.returns} description={p.flows[flow]} actions={<>{flow === "company" && can(ctx, "reports.export") && <DocumentLink kind="report" params={{ report: "company-returns", table: "entries" }} label={t.docs.pdf} />}{add}</>} />
      <SpecTable
        caption={p.tabs.returns}
        rows={returns.map((r) => ({ id: r.id, no: r.doc_no, noHref: flowPath(flow, "returns", r.id), date: r.return_date, supplier: local(r.supplier.name, r.supplier.name_ur), reason: r.reason, status: r.status, total: r.total_amount }))}
        columns={[
          { key: "no", label: t.documents.number, kind: "link", primary: true },
          ...(flow === "suppliers" ? [{ key: "supplier", label: t.documents.supplier, kind: "text" as const }] : []),
          { key: "date", label: t.documents.date, kind: "date" },
          { key: "reason", label: t.documents.reason, kind: "text", hideBelow: "lg" },
          { key: "total", label: t.documents.total, kind: "money" },
          { key: "status", label: t.common.status, kind: "status", options: { draft: { label: p.statuses.draft, tone: "gray" }, posted: { label: p.statuses.posted, tone: "green" } } },
        ]}
        server={{ page: filter.page, pageSize: LIST_PAGE, total }}
        toolbar={<ListFilters t={t} local={local} suppliers={suppliers}><UrlSelect param="status" label={t.documents.allStatuses} options={STATUSES.map((s) => ({ value: s, label: p.statuses[s] }))} /></ListFilters>}
        empty={{ title: t.documents.empty, description: t.documents.emptyHint, action: add }}
      />
    </>
  );
}
