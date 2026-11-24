import type { Metadata } from "next";
import { ArrowLeftRight } from "lucide-react";
import { voidTransferAction } from "@/features/cash-bank/actions";
import { loadTransfers } from "@/features/cash-bank/queries";
import { DOCUMENT_TONE } from "@/features/sales/status";
import { fill } from "@/i18n/format";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { LIST_PAGE, listParams } from "@/lib/list-params";
import { pageContext } from "@/lib/page-context";
import { toPaisa } from "@/lib/utils/money";
import { ActionButton } from "@/components/documents/action-button";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr, Money } from "@/components/shared/bidi";
import { formatDate } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { UrlPagination, UrlSearch, UrlSelect } from "@/components/tables/url-filters";

const STATUSES = ["posted", "void"] as const;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).cashBank.tabs.transfers };
}

export default async function TransfersPage({ searchParams }: PageProps<"/cash-bank/transfers">) {
  const { ctx, t, locale } = await pageContext();
  if (!can(ctx, "cash_bank.view")) return <Forbidden />;
  const c = t.cashBank;
  const filter = listParams(await searchParams, STATUSES);
  const { rows, total } = await loadTransfers(filter);
  const may = can(ctx, "cash_bank.transfer");
  const add = may && <LinkButton href="/cash-bank/transfers/new"><ArrowLeftRight aria-hidden />{c.newTransfer}</LinkButton>;
  return (
    <>
      <PageHeader title={c.tabs.transfers} description={c.transferHint} actions={add} />
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-2"><UrlSearch placeholder={t.documents.searchNumber} /><UrlSelect param="status" label={t.documents.allStatuses} options={STATUSES.map((s) => ({ value: s, label: t.purchasing.statuses[s] }))} /></div>
        {rows.length === 0 ? <EmptyState title={c.transferEmpty} actions={add} /> : (
          <ul className="divide-y rounded-xl border bg-card shadow-card">
            {rows.map((x) => {
              const kind = x.source?.account_type === x.target?.account_type ? "transfer" : x.source?.account_type === "cash" ? "deposit" : "withdrawal";
              return (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium"><Ltr>{x.doc_no}</Ltr> · {c.transferKinds[kind]}</p>
                    <p className="text-xs text-muted-foreground"><bdi>{x.source?.name}</bdi> {locale === "ur" ? "←" : "→"} <bdi>{x.target?.name}</bdi> · <bdi>{formatDate(x.transfer_date, locale)}</bdi>{x.reference && <> · <Ltr>{x.reference}</Ltr></>}{x.void_reason && <> · {fill(t.payroll.voidNote, { reason: x.void_reason })}</>}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Money amount={toPaisa(x.amount)} locale={locale} className="text-sm font-semibold" />
                    <StatusBadge tone={DOCUMENT_TONE[x.status] ?? "gray"}>{t.purchasing.statuses[x.status]}</StatusBadge>
                    {x.status === "posted" && may && <ActionButton label={c.void} variant="outline" action={voidTransferAction.bind(null, x.id)} reasonLabel={t.documents.reason} success={c.voided} confirm={{ title: c.voidTitle, description: c.voidHint, tone: "danger" }} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <UrlPagination page={filter.page} pageSize={LIST_PAGE} total={total} />
      </div>
    </>
  );
}
