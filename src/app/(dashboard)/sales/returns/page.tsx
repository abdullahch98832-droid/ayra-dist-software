import type { Metadata } from "next";
import { Undo2 } from "lucide-react";
import { loadReturns } from "@/features/sales/queries";
import { documentOptions } from "@/features/sales/status";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { LIST_PAGE, listParams } from "@/lib/list-params";
import { pageContext, uuidParam } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/shared/link-button";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSearch, UrlSelect } from "@/components/tables/url-filters";

const STATUSES = ["draft", "posted"] as const;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).sales.tabs.returns };
}

export default async function ReturnsPage({ searchParams }: PageProps<"/sales/returns">) {
  const { ctx, t, local } = await pageContext();
  if (!can(ctx, "sales.view_all") && !can(ctx, "sales.return")) return <Forbidden />;
  const s = t.sales;
  const query = await searchParams;
  const filter = { ...listParams(query, STATUSES), customerId: uuidParam(query.customer) };
  const { rows, total } = await loadReturns(filter);
  const add = can(ctx, "sales.return") && <LinkButton href="/sales/returns/new"><Undo2 aria-hidden />{s.newReturn}</LinkButton>;
  return (
    <>
      <PageHeader title={s.tabs.returns} actions={add} />
      <SpecTable
        caption={s.tabs.returns}
        rows={rows.map((r) => ({
          id: r.id, no: r.doc_no, noHref: `/sales/returns/${r.id}`, customer: r.customer ? local(r.customer.name, r.customer.name_ur) : null, date: r.return_date, invoice: r.invoice?.doc_no, reason: r.reason, total: r.total_amount, status: r.status,
        }))}
        columns={[
          { key: "no", label: t.documents.number, kind: "link", primary: true }, { key: "customer", label: s.customer, kind: "text" }, { key: "date", label: t.documents.date, kind: "date" },
          { key: "invoice", label: s.invoiceNo, kind: "code", hideBelow: "lg" }, { key: "reason", label: t.documents.reason, kind: "text", hideBelow: "lg" },
          { key: "total", label: t.documents.total, kind: "money" }, { key: "status", label: t.common.status, kind: "status", options: documentOptions(t) },
        ]}
        server={{ page: filter.page, pageSize: LIST_PAGE, total }}
        toolbar={<><UrlSearch placeholder={t.documents.searchNumber} /><UrlSelect param="status" label={t.documents.allStatuses} options={STATUSES.map((x) => ({ value: x, label: t.purchasing.statuses[x] }))} /></>}
        empty={{ title: s.returnEmpty, description: t.documents.emptyHint, action: add }}
      />
    </>
  );
}
