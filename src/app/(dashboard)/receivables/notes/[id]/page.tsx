import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, Printer } from "lucide-react";
import { voidNoteAction } from "@/features/receivables/actions";
import { loadNote } from "@/features/receivables/queries";
import { DOCUMENT_TONE } from "@/features/sales/status";
import { fill } from "@/i18n/format";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { toPaisa } from "@/lib/utils/money";
import { ActionButton } from "@/components/documents/action-button";
import { PrintButton } from "@/components/documents/print-button";
import { FormAlert } from "@/components/forms/field";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr, Money } from "@/components/shared/bidi";
import { DescriptionList } from "@/components/shared/description-list";
import { formatDate } from "@/components/shared/format";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).receivables.note };
}

export default async function NotePage({ params }: PageProps<"/receivables/notes/[id]">) {
  const { id, ctx, t, locale, local } = await pageContext(params);
  const note = await loadNote(id);
  if (!note) notFound();
  const r = t.receivables;
  return (
    <>
      <PageHeader
        title={note.doc_no}
        breadcrumbs={[{ label: r.tabs.notes, href: "/receivables/notes" }]}
        description={<span className="flex flex-wrap items-center gap-3"><StatusBadge tone={DOCUMENT_TONE[note.status] ?? "gray"}>{t.purchasing.statuses[note.status]}</StatusBadge>{r.noteKinds[note.kind]}</span>}
        actions={
          <>
            <PrintButton label={t.sales.print} icon={<Printer aria-hidden />} />
            {note.status === "posted" && can(ctx, "receivables.adjust") && <ActionButton label={r.voidDeposit} icon={<Ban aria-hidden />} variant="outline" action={voidNoteAction.bind(null, id)} reasonLabel={t.documents.reason} success={r.voided} confirm={{ title: r.voidNoteTitle, description: r.voidNoteHint, tone: "danger" }} />}
          </>
        }
      />
      <div className="grid gap-6">
        {note.void_reason && <FormAlert tone="info">{fill(r.voidNote, { reason: note.void_reason })}</FormAlert>}
        <SectionCard title={r.noteKinds[note.kind]}>
          <DescriptionList items={[
            { label: t.sales.customer, value: note.customer && <Link href={`/customers/${note.customer.id}`} className="text-primary hover:underline">{local(note.customer.name, note.customer.name_ur)}</Link> },
            { label: r.date, value: formatDate(note.note_date, locale) },
            { label: r.amount, value: <Money amount={toPaisa(note.amount)} locale={locale} className="font-semibold" /> },
            ...(note.invoice ? [{ label: r.forInvoice, value: <Link href={`/sales/invoices/${note.invoice.id}`} className="text-primary hover:underline"><Ltr>{note.invoice.doc_no}</Ltr></Link> }] : []),
            { label: t.documents.reason, value: note.reason },
            { label: t.documents.journal, value: note.journal && <Ltr>{note.journal.doc_no}</Ltr> },
          ]} />
        </SectionCard>
      </div>
    </>
  );
}
