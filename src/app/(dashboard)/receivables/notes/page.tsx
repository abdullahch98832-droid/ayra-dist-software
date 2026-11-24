import type { Metadata } from "next";
import { FileMinus, FilePlus2 } from "lucide-react";
import { loadNotes } from "@/features/receivables/queries";
import { NOTE_KINDS } from "@/features/receivables/schema";
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

const STATUSES = ["posted", "void"] as const;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).receivables.tabs.notes };
}

export default async function NotesPage({ searchParams }: PageProps<"/receivables/notes">) {
  const { ctx, t, local } = await pageContext();
  if (!can(ctx, "receivables.view") && !can(ctx, "receivables.adjust")) return <Forbidden />;
  const r = t.receivables;
  const query = await searchParams;
  const filter = { ...listParams(query, STATUSES), kind: NOTE_KINDS.find((k) => k === query.kind) ?? "", customerId: uuidParam(query.customer) };
  const { rows, total } = await loadNotes(filter);
  const add = can(ctx, "receivables.adjust") && (
    <>
      <LinkButton variant="outline" href="/receivables/notes/new?kind=debit"><FilePlus2 aria-hidden />{r.newDebit}</LinkButton>
      <LinkButton href="/receivables/notes/new?kind=credit"><FileMinus aria-hidden />{r.newCredit}</LinkButton>
    </>
  );
  return (
    <>
      <PageHeader title={r.tabs.notes} actions={add} />
      <SpecTable
        caption={r.tabs.notes}
        rows={rows.map((n) => ({
          id: n.id, no: n.doc_no, noHref: `/receivables/notes/${n.id}`, kind: n.kind, customer: n.customer ? local(n.customer.name, n.customer.name_ur) : null, date: n.note_date, invoice: n.invoice?.doc_no, reason: n.reason, amount: n.amount, status: n.status,
        }))}
        columns={[
          { key: "no", label: t.documents.number, kind: "link", primary: true },
          { key: "kind", label: t.stock.kind, kind: "status", options: { opening: { label: r.noteKinds.opening, tone: "gray" }, credit: { label: r.noteKinds.credit, tone: "blue" }, debit: { label: r.noteKinds.debit, tone: "amber" } } },
          { key: "customer", label: t.sales.customer, kind: "text" }, { key: "date", label: t.documents.date, kind: "date" }, { key: "invoice", label: t.sales.invoiceNo, kind: "code", hideBelow: "xl" },
          { key: "reason", label: t.documents.reason, kind: "text", hideBelow: "lg" }, { key: "amount", label: r.amount, kind: "money" }, { key: "status", label: t.common.status, kind: "status", options: documentOptions(t) },
        ]}
        server={{ page: filter.page, pageSize: LIST_PAGE, total }}
        toolbar={
          <>
            <UrlSearch placeholder={t.documents.searchNumber} />
            <UrlSelect param="kind" label={r.allNoteKinds} options={NOTE_KINDS.map((k) => ({ value: k, label: r.noteKinds[k] }))} />
            <UrlSelect param="status" label={t.documents.allStatuses} options={STATUSES.map((x) => ({ value: x, label: t.purchasing.statuses[x] }))} />
          </>
        }
        empty={{ title: r.noteEmpty }}
      />
    </>
  );
}
