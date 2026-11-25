import {
  ArrowLeftRight, Banknote, CircleCheck, ClipboardCheck, ClipboardList, CreditCard, FileText, HandCoins, Inbox, Package, PackageCheck, PackagePlus, Receipt, ReceiptText, ShoppingCart, Truck, Undo2, Wallet, Waypoints,
  type LucideIcon,
} from "lucide-react";
import type { loadMyRecords, loadOpenWork, loadPendingDeliveries, loadRecentOrders, loadRecentTransactions } from "@/features/dashboard/queries";
import type { LowStock, Overdue, OverdueSide } from "@/features/dashboard/schema";
import { fill } from "@/i18n/format";
import type { Dictionary } from "@/i18n";
import { toPaisa } from "@/lib/utils/money";
import type { Locale } from "@/types";
import { Ltr, Money } from "@/components/shared/bidi";
import { formatDate, formatNumber } from "@/components/shared/format";
import { IconTile, InitialTile } from "@/components/shared/icon-tile";
import { SectionCard } from "@/components/shared/section-card";
import { StateMessage } from "@/components/shared/states";
import { StatusBadge, type BadgeTone } from "@/components/shared/status-badge";

interface Common { t: Dictionary; locale: Locale }
type Rows<F extends (...args: never[]) => Promise<unknown>> = Awaited<ReturnType<F>>;

const KIND_ICON: Record<string, LucideIcon> = {
  sales_order: ShoppingCart, purchase_order: ClipboardList, goods_receipt: PackagePlus, supplier_invoice: Receipt, cash_deposit: Banknote, customer_payment: HandCoins, supplier_payment: CreditCard,
  sales_invoice: ReceiptText, customer_return: Undo2, expense: Wallet, fund_transfer: ArrowLeftRight, stock_count: ClipboardCheck, stock_transfer: ArrowLeftRight, dispatch: PackageCheck, delivery: Truck,
  sol_job: Waypoints, sol_delivery: Truck,
};

const STATUS_TONE: Record<string, BadgeTone> = {
  draft: "gray", submitted: "blue", approved: "blue", picking: "amber", partially_dispatched: "amber", dispatched: "amber", delivered: "green", completed: "green",
  cancelled: "gray", posted: "green", void: "gray", partially_received: "amber", received: "green",
};

function Status({ value, t }: { value: string; t: Dictionary }) {
  return <StatusBadge tone={STATUS_TONE[value] ?? "gray"}>{(t.dashboard.statuses as Record<string, string>)[value] ?? value}</StatusBadge>;
}

function ListCard({ title, description, count, locale, empty, emptyIcon = Inbox, children }: {
  title: string;
  description?: string;
  count?: number;
  locale: Locale;
  empty: string | null;
  emptyIcon?: LucideIcon;
  children?: React.ReactNode;
}) {
  return (
    <SectionCard
      title={title}
      description={description}
      className="h-full"
      action={count ? <StatusBadge tone="amber" dot={false}>{formatNumber(count, locale)}</StatusBadge> : undefined}
    >
      {empty ? <StateMessage icon={emptyIcon} headingLevel="p" title={empty} className="py-6" /> : children}
    </SectionCard>
  );
}

function Row({ lead, title, subtitle, end, endNote }: { lead?: React.ReactNode; title: React.ReactNode; subtitle?: React.ReactNode; end?: React.ReactNode; endNote?: React.ReactNode }) {
  return (
    <li className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/50">
      {lead}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium break-words">{title}</p>
        {subtitle && <p className="text-xs break-words text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="shrink-0 text-end">
        {end && <div className="text-sm font-semibold">{end}</div>}
        {endNote && <div className="text-xs text-muted-foreground">{endNote}</div>}
      </div>
    </li>
  );
}

const local = (locale: Locale, en: string | null, ur: string | null) => (locale === "ur" && ur ? ur : en) ?? "—";
const List = ({ children }: { children: React.ReactNode }) => <ul className="grid">{children}</ul>;

export function RecentOrdersCard({ rows, t, locale }: Common & { rows: Rows<typeof loadRecentOrders> }) {
  return (
    <ListCard title={t.dashboard.lists.orders} locale={locale} empty={rows.length ? null : t.dashboard.lists.ordersEmpty}>
      <List>
        {rows.map((o) => (
          <Row key={o.doc_no} lead={<InitialTile name={local(locale, o.customer, o.customer_ur)} />} title={<bdi>{local(locale, o.customer, o.customer_ur)}</bdi>}
            subtitle={<><Ltr>{o.doc_no}</Ltr> · <bdi>{formatDate(o.order_date, locale)}</bdi></>}
            end={<Money amount={toPaisa(o.total_amount)} locale={locale} />} endNote={<Status value={o.status} t={t} />} />
        ))}
      </List>
    </ListCard>
  );
}

export function RecentTransactionsCard({ rows, t, locale }: Common & { rows: Rows<typeof loadRecentTransactions> }) {
  const kinds = t.dashboard.kinds as Record<string, string>;
  return (
    <ListCard title={t.dashboard.lists.transactions} locale={locale} empty={rows.length ? null : t.dashboard.lists.transactionsEmpty}>
      <List>
        {rows.map((r) => (
          <Row key={`${r.kind}-${r.doc_no}`} lead={<IconTile icon={KIND_ICON[r.kind] ?? FileText} size="sm" />} title={kinds[r.kind] ?? r.kind}
            subtitle={<>{r.party && <><bdi>{local(locale, r.party, r.party_ur)}</bdi> · </>}<Ltr>{r.doc_no}</Ltr></>}
            end={<Money amount={toPaisa(r.amount)} locale={locale} />} endNote={<bdi>{formatDate(r.txn_date, locale)}</bdi>} />
        ))}
      </List>
    </ListCard>
  );
}

export function PendingDeliveriesCard({ rows, t, locale }: Common & { rows: Rows<typeof loadPendingDeliveries> }) {
  const total = rows[0]?.total_count ?? 0;
  return (
    <ListCard title={t.dashboard.alerts.deliveries} count={total} locale={locale} empty={rows.length ? null : t.dashboard.alerts.deliveriesEmpty} emptyIcon={CircleCheck}>
      <List>
        {rows.map((d) => (
          <Row key={d.doc_no} lead={<IconTile icon={Truck} size="sm" />} title={<bdi>{local(locale, d.customer, d.customer_ur)}</bdi>}
            subtitle={<><Ltr>{d.doc_no}</Ltr>{d.vehicle && <> · <Ltr>{d.vehicle}</Ltr></>}</>}
            end={<Status value={d.status} t={t} />} endNote={<bdi>{formatDate(d.delivery_date, locale)}</bdi>} />
        ))}
      </List>
      <More shown={rows.length} total={total} t={t} locale={locale} />
    </ListCard>
  );
}

function More({ shown, total, t, locale }: Common & { shown: number; total: number }) {
  if (total <= shown) return null;
  return <p className="mt-3 text-xs text-muted-foreground">{fill(t.dashboard.alerts.more, { count: formatNumber(total - shown, locale) })}</p>;
}

export function LowStockCard({ data, t, locale }: Common & { data: LowStock }) {
  const a = t.dashboard.alerts;
  const empty = data.count > 0 ? null : data.monitored === 0 ? a.lowStockUnmonitored : a.lowStockEmpty;
  return (
    <ListCard title={a.lowStock} description={a.lowStockHint} count={data.count} locale={locale} empty={empty} emptyIcon={data.monitored === 0 ? Inbox : CircleCheck}>
      <List>
        {data.items.map((p) => {
          const none = p.available === "0";
          const n = (v: string) => formatNumber(BigInt(v), locale);
          return (
            <Row key={p.sku} lead={<IconTile icon={Package} size="sm" tone={none ? "danger" : "attention"} />} title={<bdi>{local(locale, p.name_en, p.name_ur)}</bdi>} subtitle={<Ltr>{p.sku}</Ltr>}
              end={<StatusBadge tone={none ? "red" : "amber"}>{fill(a.available, { available: n(p.available), level: n(p.reorder_level), unit: locale === "ur" ? p.unit_ur : p.unit_en })}</StatusBadge>} />
          );
        })}
      </List>
      <More shown={data.items.length} total={data.count} t={t} locale={locale} />
    </ListCard>
  );
}

function OverdueBlock({ title, side, t, locale }: Common & { title: string; side: OverdueSide }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <h3 className="text-sm text-muted-foreground">{title}</h3>
        <Money amount={toPaisa(side.total)} locale={locale} className="text-base font-semibold text-destructive" />
      </div>
      <List>
        {side.items.map((i) => (
          <Row key={i.doc_no} lead={<InitialTile name={local(locale, i.party, i.party_ur)} tone="danger" />} title={<bdi>{local(locale, i.party, i.party_ur)}</bdi>}
            subtitle={<><Ltr>{i.doc_no}</Ltr> · {fill(t.dashboard.alerts.daysLate, { days: formatNumber(i.days, locale) })}</>}
            end={<Money amount={toPaisa(i.outstanding)} locale={locale} />} />
        ))}
      </List>
      <More shown={side.items.length} total={side.count} t={t} locale={locale} />
    </div>
  );
}

export function OverdueCard({ data, t, locale }: Common & { data: Overdue }) {
  const a = t.dashboard.alerts;
  const count = (data.receivables?.count ?? 0) + (data.payables?.count ?? 0);
  return (
    <ListCard title={a.overdue} description={a.overdueHint} count={count} locale={locale} empty={count ? null : a.overdueEmpty} emptyIcon={CircleCheck}>
      <div className="grid gap-6">
        {data.receivables && data.receivables.count > 0 && <OverdueBlock title={a.overdueReceivables} side={data.receivables} t={t} locale={locale} />}
        {data.payables && data.payables.count > 0 && <OverdueBlock title={a.overduePayables} side={data.payables} t={t} locale={locale} />}
      </div>
    </ListCard>
  );
}

const SCOPES = ["assigned", "review", "mine"] as const;

export function OpenWorkCard({ rows, t, locale }: Common & { rows: Rows<typeof loadOpenWork> }) {
  const kinds = t.dashboard.kinds as Record<string, string>;
  const total = rows.reduce((sum, r) => sum + r.waiting, 0);
  return (
    <ListCard title={t.dashboard.work.title} count={total} locale={locale} empty={rows.length ? null : t.dashboard.work.empty} emptyIcon={CircleCheck}>
      <div className="grid gap-5">
        {SCOPES.filter((s) => rows.some((r) => r.scope === s)).map((scope) => (
          <div key={scope}>
            <h3 className="mb-1 text-sm text-muted-foreground">{t.dashboard.work[scope]}</h3>
            <List>
              {rows.filter((r) => r.scope === scope).map((r) => (
                <Row key={r.kind} lead={<IconTile icon={KIND_ICON[r.kind] ?? FileText} size="sm" />} title={kinds[r.kind] ?? r.kind} end={<StatusBadge tone="blue" dot={false}><Ltr>{formatNumber(r.waiting, locale)}</Ltr></StatusBadge>} />
              ))}
            </List>
          </div>
        ))}
      </div>
    </ListCard>
  );
}

export function MyRecordsCard({ rows, t, locale }: Common & { rows: Rows<typeof loadMyRecords> }) {
  const kinds = t.dashboard.kinds as Record<string, string>;
  return (
    <ListCard title={t.dashboard.lists.myRecords} locale={locale} empty={rows.length ? null : t.dashboard.lists.myRecordsEmpty}>
      <List>
        {rows.map((r) => (
          <Row key={`${r.kind}-${r.doc_no}`} lead={<IconTile icon={KIND_ICON[r.kind] ?? FileText} size="sm" />} title={kinds[r.kind] ?? r.kind} subtitle={<Ltr>{r.doc_no}</Ltr>}
            end={<Status value={r.status} t={t} />} endNote={<bdi>{formatDate(r.record_date, locale)}</bdi>} />
        ))}
      </List>
    </ListCard>
  );
}
