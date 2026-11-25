import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Banknote, CircleCheck, Pencil, Store, Truck, Wallet } from "lucide-react";
import { businessToday, parsePeriod } from "@/features/dashboard/period";
import { EmployeeAvatar } from "@/features/employees/employee-avatar";
import { deliveryOptions } from "@/features/sales/status";
import { loadSupplyStaff, loadSupplyWork, reportSupply } from "@/features/supply/queries";
import { takerPhotos } from "@/features/takers/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { formatPaisa, toPaisa } from "@/lib/utils/money";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr } from "@/components/shared/bidi";
import { DescriptionList } from "@/components/shared/description-list";
import { formatNumber } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { StatCard } from "@/components/shared/stat-card";
import { StatGrid } from "@/components/shared/stat-grid";
import { StatusBadge } from "@/components/shared/status-badge";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).supply.supplier };
}

export default async function SupplierPersonPage({ params, searchParams }: PageProps<"/supply-team/[id]">) {
  const { id, ctx, t, locale, local } = await pageContext(params);
  if (!can(ctx, "sales.team") && !can(ctx, "sales.view_all")) return <Forbidden />;
  const x = (await loadSupplyStaff()).find((p) => p.id === id);
  if (!x) notFound();
  const s = t.supply;
  const today = businessToday();
  const period = parsePeriod(await searchParams, today);
  const all = can(ctx, "sales.view_all");
  const [photos, work, rows] = await Promise.all([takerPhotos([x]), loadSupplyWork(period.from, period.to), all ? reportSupply(period.from, period.to, id) : []]);
  const f = work.find((r) => r.employee_id === id);
  const money = (v: number | null | undefined) => (v === null || v === undefined ? "—" : <Ltr>{formatPaisa(toPaisa(v), locale)}</Ltr>);
  const paid = rows.some((r) => r.money_received !== null);
  return (
    <>
      <PageHeader
        title={local(x.nameEn, x.nameUr)} breadcrumbs={[{ label: s.title, href: "/supply-team" }]}
        description={<span className="flex flex-wrap items-center gap-3"><Ltr className="font-mono text-xs">{x.code}</Ltr><StatusBadge tone={x.isActive ? "green" : "gray"}>{x.isActive ? s.active : s.inactive}</StatusBadge></span>}
        actions={
          <>
            {can(ctx, "employees.view") && <LinkButton variant="outline" href={`/employees/${id}`}>{s.openEmployee}</LinkButton>}
            {(can(ctx, "receivables.post") || can(ctx, "receivables.view")) && <LinkButton variant="outline" href={`/receivables/cash/${id}`}><Wallet aria-hidden />{s.cash}</LinkButton>}
            {can(ctx, "sales.team") && <LinkButton href={`/supply-team/${id}/edit`}><Pencil aria-hidden />{s.edit}</LinkButton>}
          </>
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        <section className="flex flex-wrap items-start gap-6 rounded-2xl border bg-card p-5 shadow-card">
          <EmployeeAvatar name={x.nameEn} url={photos.get(x.photoPath ?? "")} className="size-24 text-2xl" />
          <div className="min-w-0 flex-1 basis-64">
            <DescriptionList items={[
              { label: t.takers.status, value: t.employees.statusLabels[x.status] }, { label: t.takers.phone, value: x.phone && <Ltr>{x.phone}</Ltr> }, { label: t.takers.whatsapp, value: x.whatsapp && <Ltr>{x.whatsapp}</Ltr> },
              ...(x.notes ? [{ label: t.documents.notes, value: x.notes }] : []),
            ]} />
          </div>
        </section>
        <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={s.performance} description={s.performanceHint}>
          <StatGrid>
            <StatCard label={s.delivered} value={formatNumber(f?.delivered ?? 0, locale)} icon={CircleCheck} />
            <StatCard label={s.onTheWay} value={formatNumber(f?.on_the_way ?? 0, locale)} icon={Truck} tone={f?.on_the_way ? "attention" : "default"} />
            <StatCard label={s.shops} value={formatNumber(f?.shops ?? 0, locale)} icon={Store} hint={<>{s.amount}: {money(f?.amount)}</>} />
            <StatCard label={s.moneyReceived} value={money(f?.money_received)} icon={Banknote} />
            <StatCard label={s.cashHeld} value={money(f?.cash_held)} icon={Wallet} tone={f?.cash_held !== null && f?.cash_held !== undefined && toPaisa(f.cash_held) > BigInt(0) ? "attention" : "default"} />
          </StatGrid>
          {all && (
            <SpecTable
              caption={s.deliveries}
              rows={rows.map((r) => ({ id: r.delivery_id, no: r.doc_no, noHref: `/sales/deliveries/${r.delivery_id}`, date: r.delivery_date, shop: local(r.customer, r.customer_ur), city: r.city, taker: r.taker_en ? local(r.taker_en, r.taker_ur) : null, received: r.received_by, at: r.delivered_at, amount: r.amount, money: r.money_received, left: r.outstanding, status: r.status }))}
              columns={[
                { key: "no", label: t.documents.number, kind: "link", primary: true }, { key: "date", label: t.documents.date, kind: "date", hideBelow: "lg" }, { key: "shop", sub: "city", label: s.shop, kind: "text" }, { key: "taker", label: s.orderTaker, kind: "text", hideBelow: "2xl" },
                { key: "received", label: s.receivedBy, kind: "text", hideBelow: "xl" }, { key: "at", label: s.deliveredAt, kind: "datetime", hideBelow: "2xl" }, { key: "amount", label: s.amount, kind: "money", total: true },
                ...(paid ? [{ key: "money", label: s.moneyReceived, kind: "money" as const, total: true }, { key: "left", label: s.outstanding, kind: "money" as const, hideBelow: "xl" as const, total: true }] : []),
                { key: "status", label: t.common.status, kind: "status", options: deliveryOptions(t) },
              ]}
              searchKeys={["no", "shop", "city", "received"]}
              empty={{ title: t.reports.empty, description: t.reports.emptyHint }}
            />
          )}
        </PeriodFrame>
      </div>
    </>
  );
}
