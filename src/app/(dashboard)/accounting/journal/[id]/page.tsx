import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer, Undo2 } from "lucide-react";
import { reverseJournalAction } from "@/features/accounting/actions";
import { loadEntry, seesLedgers, sourceHref, sourceLabel } from "@/features/accounting/queries";
import { userNames } from "@/features/expenses/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { ActionButton } from "@/components/documents/action-button";
import { PrintButton } from "@/components/documents/print-button";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr } from "@/components/shared/bidi";
import { DescriptionList } from "@/components/shared/description-list";
import { formatDate, formatDateTime } from "@/components/shared/format";
import { SectionCard } from "@/components/shared/section-card";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).accounting.entry };
}

export default async function EntryPage({ params }: PageProps<"/accounting/journal/[id]">) {
  const { id, ctx, t, locale, local } = await pageContext(params);
  if (!seesLedgers(ctx)) return <Forbidden />;
  const entry = await loadEntry(id);
  if (!entry) notFound();
  const a = t.accounting;
  const names = await userNames(ctx, [entry.posted_by]);
  const href = sourceHref(entry.source_type, entry.source_id);
  const link = (other: string | null) => other && <Link href={`/accounting/journal/${other}`} className="text-primary hover:underline"><Ltr>{entry.linked.get(other) ?? "JV"}</Ltr></Link>;
  return (
    <>
      <PageHeader
        title={entry.doc_no} breadcrumbs={[{ label: a.tabs.journal, href: "/accounting/journal" }]} description={entry.description}
        actions={
          <>
            <PrintButton label={t.sales.print} icon={<Printer aria-hidden />} />
            {entry.source_type === "manual" && !entry.reversal_of && !entry.reversed_by && can(ctx, "accounting.journal") && (
              <ActionButton label={a.reverse} icon={<Undo2 aria-hidden />} variant="outline" action={reverseJournalAction.bind(null, id)} reasonLabel={t.documents.reason} success={a.reverseDone} confirm={{ title: a.reverseTitle, description: a.reverseHint, tone: "danger" }} />
            )}
          </>
        }
      />
      <div className="grid gap-6">
        <SectionCard title={a.entry}>
          <DescriptionList items={[
            { label: a.date, value: formatDate(entry.entry_date, locale) }, { label: a.document, value: href ? <Link href={href} className="text-primary hover:underline">{sourceLabel(t, entry.source_type)}</Link> : sourceLabel(t, entry.source_type) },
            ...(entry.reversal_of ? [{ label: a.reversalOf, value: link(entry.reversal_of) }] : []), ...(entry.reversed_by ? [{ label: a.reversedBy, value: link(entry.reversed_by) }] : []),
            { label: t.expenses.recordedBy, value: <>{names.get(entry.posted_by ?? "") ?? "—"} {entry.posted_at && <span className="text-muted-foreground">· <bdi>{formatDateTime(entry.posted_at, locale)}</bdi></span>}</> },
          ]} />
        </SectionCard>
        <SpecTable
          caption={a.entry}
          rows={entry.lines.map((l) => ({ id: String(l.line_no), account: local(l.name_en, l.name_ur), accountHref: `/accounting/ledger?account=${l.account_id}`, code: l.code, party: l.party ? local(l.party, l.party_ur) : null, description: l.description, debit: l.debit || null, credit: l.credit || null }))}
          columns={[{ key: "account", sub: "code", label: a.account, kind: "link", primary: true }, { key: "party", label: a.party, kind: "text" }, { key: "description", label: a.description, kind: "text", hideBelow: "lg" }, { key: "debit", label: a.debit, kind: "money", total: true }, { key: "credit", label: a.credit, kind: "money", total: true }]}
          empty={{ title: a.ledgerEmpty }}
        />
      </div>
    </>
  );
}
