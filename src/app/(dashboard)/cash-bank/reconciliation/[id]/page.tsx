import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteReconciliationAction, reopenReconciliationAction } from "@/features/cash-bank/actions";
import { loadBankReconciliation } from "@/features/cash-bank/queries";
import { fill, isolate } from "@/i18n/format";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { formatPaisa, toPaisa } from "@/lib/utils/money";
import { ActionButton } from "@/components/documents/action-button";
import { FormAlert } from "@/components/forms/field";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { formatDate } from "@/components/shared/format";
import { StatusBadge } from "@/components/shared/status-badge";
import { ReconciliationSheet } from "./sheet";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).analytics.bank.title };
}

export default async function BankReconciliationPage({ params }: PageProps<"/cash-bank/reconciliation/[id]">) {
  const { id, ctx, t, locale } = await pageContext(params);
  const reconciles = can(ctx, "cash_bank.reconcile");
  if (!can(ctx, "cash_bank.view") && !reconciles) return <Forbidden />;
  const r = await loadBankReconciliation(id);
  if (!r) notFound();
  const { analytics: a } = t;
  const b = a.bank;
  const draft = r.status === "draft";
  const gap = toPaisa(r.totals.difference);
  return (
    <>
      <PageHeader
        title={r.account} breadcrumbs={[{ label: b.title, href: "/cash-bank/reconciliation" }]}
        description={<span className="flex flex-wrap items-center gap-2"><bdi>{r.number}</bdi>·<bdi>{formatDate(r.date, locale)}</bdi><StatusBadge tone={draft ? "amber" : "green"}>{a.statuses[r.status]}</StatusBadge></span>}
        actions={reconciles && (
          <>
            {draft && <ActionButton label={b.delete} variant="outline" action={deleteReconciliationAction.bind(null, r.id)} success={b.deleted} redirectTo="/cash-bank/reconciliation" confirm={{ title: b.deleteTitle, description: b.deleteHint, tone: "danger" }} />}
            {!draft && r.latest && <ActionButton label={b.reopen} variant="outline" action={reopenReconciliationAction.bind(null, r.id)} reasonLabel={t.documents.reason} success={b.reopened} confirm={{ title: b.reopenTitle, description: b.reopenHint }} />}
          </>
        )}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {!draft && gap !== BigInt(0) && <FormAlert>{fill(b.changedSince, { amount: isolate(formatPaisa(gap, locale)) })}</FormAlert>}
        {!draft && r.completedAt && <p className="text-sm text-muted-foreground">{fill(b.completedBy, { date: isolate(formatDate(r.completedAt, locale) ?? ""), name: isolate(r.completedBy ?? "—") })}</p>}
        {draft && r.reopenReason && <p className="text-sm text-muted-foreground">{fill(b.reopenedNote, { reason: isolate(r.reopenReason) })}</p>}
        <ReconciliationSheet key={`${r.id}-${r.status}`} reconciliation={r} editable={draft && reconciles} />
      </div>
    </>
  );
}
