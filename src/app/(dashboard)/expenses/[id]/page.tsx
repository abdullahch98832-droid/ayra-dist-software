import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, CheckCheck, Paperclip, Pencil, Trash2, X } from "lucide-react";
import { deleteExpenseAction, postExpenseAction, rejectExpenseAction, voidExpenseAction } from "@/features/expenses/actions";
import { loadExpense, receiptUrl, userNames } from "@/features/expenses/queries";
import { expenseStatus } from "@/features/expenses/schema";
import { EXPENSE_TONE } from "@/features/expenses/status";
import { fill } from "@/i18n/format";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { toPaisa } from "@/lib/utils/money";
import { DocumentLink } from "@/components/documents/document-link";
import { ActionButton } from "@/components/documents/action-button";
import { FormAlert } from "@/components/forms/field";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr, Money } from "@/components/shared/bidi";
import { DescriptionList } from "@/components/shared/description-list";
import { formatDate, formatDateTime, formatNumber } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { AttachReceipt } from "./attach-receipt";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).expenses.expense };
}

export default async function ExpensePage({ params }: PageProps<"/expenses/[id]">) {
  const { id, ctx, t, locale, local } = await pageContext(params);
  const e = await loadExpense(id);
  if (!e) notFound();
  const x = t.expenses;
  const d = t.documents;
  const poster = can(ctx, "expenses.post");
  const own = e.created_by === ctx.userId && can(ctx, "expenses.create");
  const status = expenseStatus(e);
  const [receipt, names] = await Promise.all([receiptUrl(e.receipt_path), userNames(ctx, [e.created_by, e.posted_by])]);
  const decided = e.posted_by ? names.get(e.posted_by) : null;
  return (
    <>
      <PageHeader
        title={e.doc_no}
        breadcrumbs={[{ label: x.title, href: "/expenses" }]}
        description={<span className="flex flex-wrap items-center gap-3"><StatusBadge tone={EXPENSE_TONE[status] ?? "gray"}>{x.statuses[status]}</StatusBadge><bdi>{e.category && local(e.category.name_en, e.category.name_ur)}</bdi></span>}
        actions={
          <>
            <DocumentLink kind="expense_voucher" params={{ id }} label={t.docs.pdf} />
            {status === "draft" && (own || poster) && (
              <>
                <ActionButton label={d.deleteDraft} icon={<Trash2 aria-hidden />} variant="outline" action={deleteExpenseAction.bind(null, id)} success={d.deleted} redirectTo="/expenses" confirm={{ title: d.confirmDeleteTitle, description: d.confirmDelete, tone: "danger" }} />
                <LinkButton variant="outline" href={`/expenses/${id}/edit`}><Pencil aria-hidden />{x.edit}</LinkButton>
              </>
            )}
            {status === "draft" && poster && <ActionButton label={x.reject} icon={<X aria-hidden />} variant="outline" action={rejectExpenseAction.bind(null, id)} reasonLabel={d.reason} success={x.rejected} confirm={{ title: x.rejectTitle, description: x.rejectHint, tone: "danger" }} />}
            {status === "posted" && poster && <ActionButton label={x.void} icon={<Ban aria-hidden />} variant="outline" action={voidExpenseAction.bind(null, id)} reasonLabel={d.reason} success={x.voided} confirm={{ title: x.voidTitle, description: x.voidHint, tone: "danger" }} />}
            {status === "draft" && poster && <ActionButton label={x.post} icon={<CheckCheck aria-hidden />} action={postExpenseAction.bind(null, id)} success={x.posted} confirm={{ title: x.postTitle, description: x.postHint }} />}
          </>
        }
      />
      <div className="grid gap-6">
        {e.void_reason && <FormAlert tone="info">{fill(status === "rejected" ? x.rejectedNote : x.voidNote, { reason: e.void_reason })}</FormAlert>}
        <SectionCard title={x.expense}>
          <DescriptionList items={[
            { label: x.voucherNo, value: <Ltr>{e.doc_no}</Ltr> }, { label: x.category, value: e.category && local(e.category.name_en, e.category.name_ur) },
            { label: x.amount, value: <Money amount={toPaisa(e.amount)} locale={locale} className="font-semibold" /> }, { label: x.date, value: formatDate(e.expense_date, locale) },
            { label: x.payee, value: e.payee }, { label: x.description, value: e.description },
            { label: x.method, value: e.method && t.purchasing.methods[e.method] }, { label: x.paidFrom, value: e.account?.name }, { label: x.reference, value: e.reference && <Ltr>{e.reference}</Ltr> },
            {
              label: x.receipt,
              value: receipt ? <a href={receipt} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline"><Paperclip className="size-4" aria-hidden />{x.openReceipt}</a>
                : <span>{x.noReceipt}{e.no_receipt_reason && <span className="text-muted-foreground"> · {e.no_receipt_reason}</span>}</span>,
            },
            { label: x.recordedBy, value: <>{names.get(e.created_by ?? "") ?? "—"} <span className="text-muted-foreground">· <bdi>{formatDateTime(e.created_at, locale)}</bdi></span></> },
            { label: status === "rejected" ? x.rejectedBy : x.approvedBy, value: decided ? <>{decided} {e.posted_at && <span className="text-muted-foreground">· <bdi>{formatDateTime(e.posted_at, locale)}</bdi></span>}</> : null },
            { label: t.common.status, value: x.statuses[status] },
            ...(e.vehicle ? [{ label: x.vehicle, value: can(ctx, "vehicles.view") ? <Link href={`/vehicles/${e.vehicle.id}`} className="text-primary hover:underline"><Ltr>{e.vehicle.registration_no}</Ltr></Link> : <Ltr>{e.vehicle.registration_no}</Ltr> }] : []),
            ...(e.job ? [{ label: x.job, value: can(ctx, "sol.view") ? <Link href={`/sol/jobs/${e.job.id}`} className="text-primary hover:underline"><Ltr>{e.job.doc_no}</Ltr></Link> : <Ltr>{e.job.doc_no}</Ltr> }] : []),
            ...(e.litres !== null ? [{ label: x.litres, value: formatNumber(e.litres, locale) }] : []), ...(e.odometer !== null ? [{ label: x.odometer, value: formatNumber(e.odometer, locale) }] : []),
            { label: d.journal, value: e.journal && <Ltr>{e.journal.doc_no}</Ltr> },
          ]} />
        </SectionCard>
        {!e.receipt_path && (own || poster) && (status === "draft" || status === "posted") && <AttachReceipt expenseId={id} />}
      </div>
    </>
  );
}
