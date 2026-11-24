import type { Metadata } from "next";
import { ClipboardCheck } from "lucide-react";
import { inventoryPage } from "@/features/inventory/page-context";
import { loadCounts } from "@/features/inventory/queries";
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
  return { title: (await getT()).stock.tabs.counts };
}

export default async function CountsPage({ searchParams }: PageProps<"/inventory/counts">) {
  const { ctx, t, local } = await inventoryPage();
  if (!can(ctx, "inventory.view")) return <Forbidden />;
  const s = t.stock;
  const st = t.purchasing.statuses;
  const filter = listParams(await searchParams, ["draft", "posted"]);
  const { rows: counts, total } = await loadCounts(filter);
  const add = can(ctx, "inventory.count") && <LinkButton href="/inventory/counts/new"><ClipboardCheck aria-hidden />{s.newCount}</LinkButton>;
  return (
    <>
      <PageHeader title={s.tabs.counts} actions={add} />
      <SpecTable
        caption={s.tabs.counts}
        rows={counts.map((c) => ({
          id: c.id, no: c.doc_no, noHref: `/inventory/counts/${c.id}`, date: c.count_date, warehouse: local(c.warehouse.name_en, c.warehouse.name_ur),
          lines: c.stock_count_items.length, differences: c.stock_count_items.filter((i) => i.difference !== 0).length, notes: c.notes, status: c.status,
        }))}
        columns={[
          { key: "no", label: t.documents.number, kind: "link", primary: true }, { key: "date", label: t.documents.date, kind: "date" },
          { key: "warehouse", label: t.documents.warehouse, kind: "text" }, { key: "lines", label: s.linesCounted, kind: "quantity" },
          { key: "differences", label: s.differences, kind: "quantity" }, { key: "notes", label: t.documents.notes, kind: "text", hideBelow: "xl" },
          { key: "status", label: t.common.status, kind: "status", options: { draft: { label: st.draft, tone: "gray" }, posted: { label: st.posted, tone: "green" } } },
        ]}
        server={{ page: filter.page, pageSize: LIST_PAGE, total }}
        toolbar={<ListFilters t={t}><UrlSelect param="status" label={t.documents.allStatuses} options={[{ value: "draft", label: st.draft }, { value: "posted", label: st.posted }]} /></ListFilters>}
        empty={{ title: s.countEmpty, description: t.documents.emptyHint, action: add }}
      />
    </>
  );
}
