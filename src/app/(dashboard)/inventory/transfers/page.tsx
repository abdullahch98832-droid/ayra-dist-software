import type { Metadata } from "next";
import { ArrowLeftRight } from "lucide-react";
import { inventoryPage } from "@/features/inventory/page-context";
import { loadTransfers } from "@/features/inventory/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { LIST_PAGE, listParams } from "@/lib/list-params";
import { ListFilters } from "@/components/documents/list-filters";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/shared/link-button";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSelect } from "@/components/tables/url-filters";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).stock.tabs.transfers };
}

export default async function TransfersPage({ searchParams }: PageProps<"/inventory/transfers">) {
  const { ctx, t, local } = await inventoryPage();
  if (!can(ctx, "inventory.view")) return <Forbidden />;
  const s = t.stock;
  const st = t.purchasing.statuses;
  const filter = listParams(await searchParams, ["draft", "posted"]);
  const { rows: transfers, total } = await loadTransfers(filter);
  const add = can(ctx, "inventory.transfer") && <LinkButton href="/inventory/transfers/new"><ArrowLeftRight aria-hidden />{s.newTransfer}</LinkButton>;
  return (
    <>
      <PageHeader title={s.tabs.transfers} actions={add} />
      <SpecTable
        caption={s.tabs.transfers}
        rows={transfers.map((x) => ({ id: x.id, no: x.doc_no, noHref: `/inventory/transfers/${x.id}`, date: x.transfer_date, from: local(x.from.name_en, x.from.name_ur), to: local(x.to.name_en, x.to.name_ur), lines: x.stock_transfer_items.length, notes: x.notes, status: x.status }))}
        columns={[
          { key: "no", label: t.documents.number, kind: "link", primary: true }, { key: "date", label: t.documents.date, kind: "date" },
          { key: "from", label: s.fromWarehouse, kind: "text" }, { key: "to", label: s.toWarehouse, kind: "text" },
          { key: "lines", label: t.documents.lines, kind: "quantity", hideBelow: "lg" }, { key: "notes", label: t.documents.notes, kind: "text", hideBelow: "xl" },
          { key: "status", label: t.common.status, kind: "status", options: { draft: { label: st.draft, tone: "gray" }, posted: { label: st.posted, tone: "green" } } },
        ]}
        server={{ page: filter.page, pageSize: LIST_PAGE, total }}
        toolbar={<ListFilters t={t}><UrlSelect param="status" label={t.documents.allStatuses} options={[{ value: "draft", label: st.draft }, { value: "posted", label: st.posted }]} /></ListFilters>}
        empty={{ title: s.transferEmpty, description: t.documents.emptyHint, action: add }}
      />
    </>
  );
}
