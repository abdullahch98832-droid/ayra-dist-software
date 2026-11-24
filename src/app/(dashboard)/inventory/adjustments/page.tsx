import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { inventoryPage } from "@/features/inventory/page-context";
import { loadAdjustments } from "@/features/inventory/queries";
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
  return { title: (await getT()).stock.tabs.adjustments };
}

export default async function AdjustmentsPage({ searchParams }: PageProps<"/inventory/adjustments">) {
  const { ctx, t, local } = await inventoryPage();
  if (!can(ctx, "inventory.view")) return <Forbidden />;
  const s = t.stock;
  const st = t.purchasing.statuses;
  const query = await searchParams;
  const kinds = s.kinds;
  const filter = listParams(query, ["draft", "posted"]);
  const { rows: adjustments, total } = await loadAdjustments(filter, typeof query.kind === "string" && query.kind in kinds ? query.kind : "");
  const add = can(ctx, "inventory.adjust") && (
    <>
      <LinkButton variant="outline" href="/inventory/adjustments/new?kind=opening"><Plus aria-hidden />{s.newOpening}</LinkButton>
      <LinkButton href="/inventory/adjustments/new"><Plus aria-hidden />{s.newAdjustment}</LinkButton>
    </>
  );
  return (
    <>
      <PageHeader title={s.tabs.adjustments} actions={add} />
      <SpecTable
        caption={s.tabs.adjustments}
        rows={adjustments.map((a) => ({ id: a.id, no: a.doc_no, noHref: `/inventory/adjustments/${a.id}`, date: a.adjustment_date, kind: kinds[a.kind], warehouse: local(a.warehouse.name_en, a.warehouse.name_ur), reason: a.reason, status: a.status }))}
        columns={[
          { key: "no", label: t.documents.number, kind: "link", primary: true }, { key: "date", label: t.documents.date, kind: "date" },
          { key: "kind", label: s.kind, kind: "text" }, { key: "warehouse", label: t.documents.warehouse, kind: "text" }, { key: "reason", label: t.documents.reason, kind: "text", hideBelow: "lg" },
          { key: "status", label: t.common.status, kind: "status", options: { draft: { label: st.draft, tone: "gray" }, posted: { label: st.posted, tone: "green" } } },
        ]}
        server={{ page: filter.page, pageSize: LIST_PAGE, total }}
        toolbar={
          <ListFilters t={t}>
            <UrlSelect param="kind" label={s.allKinds} options={Object.entries(kinds).map(([value, label]) => ({ value, label }))} />
            <UrlSelect param="status" label={t.documents.allStatuses} options={[{ value: "draft", label: st.draft }, { value: "posted", label: st.posted }]} />
          </ListFilters>
        }
        empty={{ title: s.adjustmentEmpty, description: t.documents.emptyHint }}
      />
    </>
  );
}
