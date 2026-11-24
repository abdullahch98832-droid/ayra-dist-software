import type { Metadata } from "next";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { voidVoucherAction } from "@/features/cash-bank/actions";
import { loadVouchers } from "@/features/cash-bank/queries";
import { VOUCHER_KINDS } from "@/features/cash-bank/schema";
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
  return { title: (await getT()).cashBank.tabs.vouchers };
}

export default async function VouchersPage({ searchParams }: PageProps<"/cash-bank/vouchers">) {
  const { ctx, t, locale, local } = await pageContext();
  if (!can(ctx, "cash_bank.view") && !can(ctx, "accounting.view")) return <Forbidden />;
  const c = t.cashBank;
  const query = await searchParams;
  const kind = VOUCHER_KINDS.find((k) => k === query.kind) ?? "";
  const filter = { ...listParams(query, STATUSES), kind };
  const { rows, total } = await loadVouchers(filter);
  const may = can(ctx, "accounting.journal");
  return (
    <>
      <PageHeader
        title={c.tabs.vouchers} description={c.voucherHint}
        actions={may && <><LinkButton variant="outline" href="/cash-bank/vouchers/new?kind=payment"><ArrowUpFromLine aria-hidden />{c.newPayment}</LinkButton><LinkButton href="/cash-bank/vouchers/new?kind=receipt"><ArrowDownToLine aria-hidden />{c.newReceipt}</LinkButton></>}
      />
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          <UrlSearch placeholder={t.documents.searchNumber} />
          <UrlSelect param="kind" label={c.type} options={VOUCHER_KINDS.map((k) => ({ value: k, label: c.voucherKinds[k] }))} />
          <UrlSelect param="status" label={t.documents.allStatuses} options={STATUSES.map((s) => ({ value: s, label: t.purchasing.statuses[s] }))} />
        </div>
        {rows.length === 0 ? <EmptyState title={c.voucherEmpty} /> : (
          <ul className="divide-y rounded-xl border bg-card shadow-card">
            {rows.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium break-words"><Ltr>{x.doc_no}</Ltr> · {x.description}</p>
                  <p className="text-xs text-muted-foreground">{c.voucherKinds[x.kind as "receipt"]} · <bdi>{x.account?.name}</bdi> · <bdi>{x.counter && local(x.counter.name_en, x.counter.name_ur)}</bdi>{x.party_name && <> · <bdi>{x.party_name}</bdi></>} · <bdi>{formatDate(x.voucher_date, locale)}</bdi>{x.void_reason && <> · {fill(t.payroll.voidNote, { reason: x.void_reason })}</>}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Money amount={toPaisa(x.kind === "payment" ? -x.amount : x.amount)} locale={locale} className="text-sm font-semibold" />
                  <StatusBadge tone={DOCUMENT_TONE[x.status] ?? "gray"}>{t.purchasing.statuses[x.status]}</StatusBadge>
                  {x.status === "posted" && may && <ActionButton label={c.void} variant="outline" action={voidVoucherAction.bind(null, x.id)} reasonLabel={t.documents.reason} success={c.voided} confirm={{ title: c.voidTitle, description: c.voidHint, tone: "danger" }} />}
                </div>
              </li>
            ))}
          </ul>
        )}
        <UrlPagination page={filter.page} pageSize={LIST_PAGE} total={total} />
      </div>
    </>
  );
}
