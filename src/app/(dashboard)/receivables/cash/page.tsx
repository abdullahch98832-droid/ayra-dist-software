import type { Metadata } from "next";
import { HandCoins, Wallet } from "lucide-react";
import { deleteReceivableDraftAction, postDepositAction, voidDepositAction } from "@/features/receivables/actions";
import { loadCash, loadDeposits, seesAllCollections } from "@/features/receivables/queries";
import { peopleNames } from "@/features/payments/contributors";
import { DOCUMENT_TONE } from "@/features/sales/status";
import { loadCollectors, takerNames } from "@/features/takers/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { LIST_PAGE, listParams } from "@/lib/list-params";
import { pageContext, uuidParam } from "@/lib/page-context";
import { formatPaisa, sumPaisa, toPaisa } from "@/lib/utils/money";
import { ActionButton } from "@/components/documents/action-button";
import { Forbidden } from "@/components/layout/forbidden";
import { DocumentLink } from "@/components/documents/document-link";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr, Money } from "@/components/shared/bidi";
import { formatDate } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { StatGrid } from "@/components/shared/stat-grid";
import { StateMessage } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlPagination, UrlSelect } from "@/components/tables/url-filters";
import { ReconcileButton } from "./reconcile-button";

const STATUSES = ["draft", "posted", "void"] as const;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).receivables.tabs.cash };
}

export default async function CashPage({ searchParams }: PageProps<"/receivables/cash">) {
  const { ctx, t, locale, local } = await pageContext();
  if (!can(ctx, "receivables.post") && !can(ctx, "receivables.collect") && !can(ctx, "receivables.view")) return <Forbidden />;
  const r = t.receivables;
  const query = await searchParams;
  const all = seesAllCollections(ctx);
  // Holders of receivables.view alone see nothing here but their own cash.
  const mayLoad = all || can(ctx, "receivables.collect");
  const poster = can(ctx, "receivables.post");
  const filter = { ...listParams(query, STATUSES), takerId: uuidParam(query.taker) };
  const [cash, deposits, takers, names] = await Promise.all([mayLoad ? loadCash() : [], loadDeposits(filter), all ? loadCollectors() : [], takerNames()]);
  const total = sumPaisa(cash.map((c) => toPaisa(c.held)));
  const shown = cash.filter((c) => c.is_active || toPaisa(c.held) !== BigInt(0) || toPaisa(c.waiting_deposits) !== BigInt(0));
  const mayDeposit = poster || (can(ctx, "receivables.collect") && cash.some((c) => c.employee_id === ctx.employeeId));
  return (
    <>
      <PageHeader title={r.tabs.cash} description={r.cashHint} actions={mayDeposit && <LinkButton href="/receivables/cash/deposit"><HandCoins aria-hidden />{r.newDeposit}</LinkButton>} />
      <div className="grid gap-6">
        {all && <StatGrid><StatCard label={r.totalHeld} value={<Ltr>{formatPaisa(total, locale)}</Ltr>} icon={Wallet} tone={total > BigInt(0) ? "attention" : "default"} /></StatGrid>}
        <SpecTable
          caption={r.tabs.cash}
          rows={shown.map((c) => ({
            id: c.employee_id, name: local(c.full_name, c.full_name_ur), nameHref: `/receivables/cash/${c.employee_id}`, held: c.held, waiting: c.waiting_collections, deposits: c.waiting_deposits,
            last: c.last_deposit, count: c.last_count, difference: c.last_difference,
            deposit: poster && toPaisa(c.held) > BigInt(0) ? r.newDeposit : null, depositHref: `/receivables/cash/deposit?taker=${c.employee_id}`,
          }))}
          columns={[
            { key: "name", label: t.receivables.collectedBy, kind: "link", primary: true },
            { key: "held", label: r.held, kind: "money", total: true },
            { key: "waiting", label: r.waitingCollections, kind: "money", hideBelow: "xl", total: true },
            { key: "deposits", label: r.waitingDeposits, kind: "money", hideBelow: "lg", total: true },
            { key: "last", label: r.lastDeposit, kind: "date", hideBelow: "lg" },
            { key: "count", label: r.lastCount, kind: "date", hideBelow: "xl" },
            { key: "difference", label: r.difference, kind: "money", hideBelow: "xl" },
            ...(poster ? [{ key: "deposit", label: r.deposit, kind: "link" as const }] : []),
          ]}
          searchKeys={["name"]}
          empty={{ title: r.cashEmpty }}
        />
        {poster && shown.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {shown.map((c) => <ReconcileButton key={c.employee_id} employeeId={c.employee_id} name={local(c.full_name, c.full_name_ur)} held={c.held} />)}
          </div>
        )}
        <SectionCard
          title={r.deposits}
          action={
            <span className="flex flex-wrap gap-2">
              <UrlSelect param="status" label={t.documents.allStatuses} options={STATUSES.map((x) => ({ value: x, label: t.purchasing.statuses[x] }))} />
              {takers.length > 0 && <UrlSelect param="taker" label={t.receivables.collectedBy} options={takers.map((x) => ({ value: x.id, label: local(x.nameEn, x.nameUr) }))} />}
            </span>
          }
        >
          {deposits.rows.length === 0 ? <StateMessage headingLevel="p" icon={HandCoins} title={r.depositEmpty} className="py-6" /> : (
            <ul className="divide-y">
              {deposits.rows.map((x) => {
                const name = names.get(x.employee_id);
                return (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3 first:pt-0">
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="text-sm font-medium"><Ltr>{x.doc_no}</Ltr> · <bdi>{name && local(name.nameEn, name.nameUr)}</bdi></p>
                      <p className="text-xs text-muted-foreground"><bdi>{formatDate(x.deposit_date, locale)}</bdi> · <bdi>{peopleNames(x.contributors) ?? x.account?.name}</bdi>{x.reference && <> · <Ltr>{x.reference}</Ltr></>}{x.void_reason && <> · {x.void_reason}</>}</p>
                    </div>
                    <div className="flex items-center gap-3"><Money amount={toPaisa(x.amount)} locale={locale} className="font-semibold" /><StatusBadge tone={DOCUMENT_TONE[x.status] ?? "gray"}>{t.purchasing.statuses[x.status]}</StatusBadge></div>
                    <div className="flex gap-2">
                      <DocumentLink kind="cash_deposit" params={{ id: x.id }} label={t.docs.pdf} />
                      {x.status === "draft" && (poster || x.employee_id === ctx.employeeId) && <ActionButton label={t.documents.deleteDraft} variant="outline" action={deleteReceivableDraftAction.bind(null, "cash_deposits", x.id)} success={t.documents.deleted} confirm={{ title: t.documents.confirmDeleteTitle, description: t.documents.confirmDelete, tone: "danger" }} />}
                      {x.status === "draft" && poster && <ActionButton label={r.confirmDeposit} action={postDepositAction.bind(null, x.id)} success={r.depositConfirmed} confirm={{ title: r.confirmDepositTitle, description: r.depositHint }} />}
                      {x.status === "posted" && poster && <ActionButton label={r.voidDeposit} variant="outline" action={voidDepositAction.bind(null, x.id)} reasonLabel={t.documents.reason} success={r.voided} confirm={{ title: r.voidDepositTitle, description: r.voidDepositHint, tone: "danger" }} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {deposits.total > LIST_PAGE && <div className="pt-4"><UrlPagination page={filter.page} pageSize={LIST_PAGE} total={deposits.total} /></div>}
        </SectionCard>
      </div>
    </>
  );
}
