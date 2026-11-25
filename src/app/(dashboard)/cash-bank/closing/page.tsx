import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { reopenDayAction } from "@/features/cash-bank/actions";
import { loadClosings, loadPaymentAccounts, reportCashAccounts } from "@/features/cash-bank/queries";
import { businessToday } from "@/features/dashboard/period";
import { userNames } from "@/features/expenses/queries";
import { fill, isolate } from "@/i18n/format";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { LIST_PAGE, listParams } from "@/lib/list-params";
import { pageContext, uuidParam } from "@/lib/page-context";
import { toPaisa } from "@/lib/utils/money";
import { ActionButton } from "@/components/documents/action-button";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr, Money } from "@/components/shared/bidi";
import { formatDate } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { UrlPagination, UrlSelect } from "@/components/tables/url-filters";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).cashBank.closingTitle };
}

export default async function ClosingPage({ searchParams }: PageProps<"/cash-bank/closing">) {
  const { ctx, t, locale } = await pageContext();
  const closer = can(ctx, "cash_bank.close");
  if (!can(ctx, "cash_bank.view") && !closer) return <Forbidden />;
  const c = t.cashBank;
  const query = await searchParams;
  const filter = { ...listParams(query, []), accountId: uuidParam(query.account) };
  const today = businessToday();
  const [{ rows, total }, accounts, balances] = await Promise.all([loadClosings(filter), can(ctx, "cash_bank.view") ? loadPaymentAccounts() : [], can(ctx, "cash_bank.view") ? reportCashAccounts(today, today) : []]);
  const names = await userNames(ctx, rows.map((r) => r.created_by));
  const until = new Map(balances.map((b) => [b.account_id, b]));
  const boxes = accounts.filter((a) => a.type === "cash" && a.isActive);
  const latest = new Set(rows.filter((r) => r.status === "closed" && until.get(r.financial_account_id)?.closed_until === r.closing_date).map((r) => r.id));
  return (
    <>
      <PageHeader title={c.closingTitle} description={c.closingHint} />
      <div className="grid gap-6">
        {boxes.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {boxes.map((b) => {
              const x = until.get(b.id);
              return (
                <li key={b.id} className="grid gap-3 rounded-2xl border bg-card p-5 shadow-card">
                  <div><p className="font-medium break-words text-navy">{b.name}</p><p className="text-xs text-muted-foreground">{x?.closed_until ? <>{c.closedUntil}: <bdi>{formatDate(x.closed_until, locale)}</bdi></> : c.neverClosed}</p></div>
                  <p className="text-2xl font-semibold text-navy"><Money amount={toPaisa(x?.closing ?? 0)} locale={locale} /></p>
                  {closer && x?.closed_until !== today && <LinkButton href={`/cash-bank/closing/new?account=${b.id}`} className="justify-self-start"><Lock aria-hidden />{c.closeDay}</LinkButton>}
                </li>
              );
            })}
          </ul>
        )}
        {boxes.length > 1 && <UrlSelect param="account" label={c.chooseAccount} options={boxes.map((b) => ({ value: b.id, label: b.name }))} />}
        {rows.length === 0 ? <EmptyState title={c.closingEmpty} description={boxes.length === 0 ? c.noCash : undefined} /> : (
          <ul className="divide-y rounded-2xl border bg-card shadow-card">
            {rows.map((r) => {
              const diff = toPaisa(r.difference ?? 0);
              const word = diff === BigInt(0) ? c.exact : diff > BigInt(0) ? c.over : c.short;
              return (
                <li key={r.id} className="grid gap-3 px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium"><bdi>{formatDate(r.closing_date, locale)}</bdi> · <bdi>{r.account?.name}</bdi></p>
                      <p className="text-xs text-muted-foreground"><Ltr>{r.doc_no}</Ltr>{names.get(r.created_by ?? "") && <> · {names.get(r.created_by ?? "")}</>}{r.notes && <> · <bdi>{r.notes}</bdi></>}{r.reopen_reason && <> · {fill(t.accounting.reopenedNote, { reason: isolate(r.reopen_reason) })}</>}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <StatusBadge tone={diff === BigInt(0) ? "green" : "amber"}>{word}</StatusBadge>
                      {r.difference_entry_id && <StatusBadge tone="blue">{c.booked}</StatusBadge>}
                      <StatusBadge tone={r.status === "closed" ? "green" : "gray"}>{c.closingStatus[r.status as "closed"]}</StatusBadge>
                      {closer && latest.has(r.id) && <ActionButton label={c.reopen} variant="outline" action={reopenDayAction.bind(null, r.id)} reasonLabel={t.documents.reason} success={c.reopened} confirm={{ title: c.reopenTitle, description: c.reopenHint, tone: "danger" }} />}
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-6">
                    {([[c.opening, r.opening_balance], [c.receipts, r.receipts], [c.payments, r.payments], [c.expected, r.expected], [c.counted, r.counted], [c.difference, r.difference ?? 0]] as const).map(([label, value]) => (
                      <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd><Money amount={toPaisa(value)} locale={locale} className="font-medium" /></dd></div>
                    ))}
                  </dl>
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
