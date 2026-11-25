import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Banknote, CircleCheck, CircleX, HandCoins, Pencil, ShoppingCart, TrendingUp, Users, Wallet } from "lucide-react";
import { loadCustomers } from "@/features/customers/queries";
import { businessToday, parsePeriod } from "@/features/dashboard/period";
import { EmployeeAvatar } from "@/features/employees/employee-avatar";
import { loadTakerReport, loadTakers, takerPhotos } from "@/features/takers/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { LIST_PAGE, listParams } from "@/lib/list-params";
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
  return { title: (await getT()).takers.title };
}

export default async function TakerPage({ params, searchParams }: PageProps<"/order-takers/[id]">) {
  const { id, ctx, t, locale, local } = await pageContext(params);
  const own = ctx.employeeId === id;
  if (!own && !can(ctx, "sales.team") && !can(ctx, "sales.view_all")) return <Forbidden />;
  const taker = (await loadTakers()).find((x) => x.id === id);
  if (!taker) notFound();
  const k = t.takers;
  const query = await searchParams;
  const today = businessToday();
  const period = parsePeriod(query, today);
  const filter = { ...listParams(query, []), takerId: id, city: "" };
  const seesFigures = can(ctx, "sales.view_all") || (own && can(ctx, "sales.view"));
  const [photos, report, customers] = await Promise.all([
    takerPhotos([taker]), seesFigures ? loadTakerReport(period.from, period.to) : [], can(ctx, "customers.view") ? loadCustomers(ctx, filter) : { rows: [], total: 0 },
  ]);
  const f = report.find((r) => r.employee_id === id);
  const money = (v: number | null) => (v === null ? "—" : <Ltr>{formatPaisa(toPaisa(v), locale)}</Ltr>);
  const count = (v: number) => formatNumber(v, locale);
  return (
    <>
      <PageHeader
        title={local(taker.nameEn, taker.nameUr)}
        breadcrumbs={[{ label: k.title, href: "/order-takers" }]}
        description={<span className="flex flex-wrap items-center gap-3"><Ltr className="font-mono text-xs">{taker.code}</Ltr><StatusBadge tone={taker.isActive ? "green" : "gray"}>{taker.isActive ? k.active : k.inactive}</StatusBadge></span>}
        actions={
          <>
            {can(ctx, "employees.view") && <LinkButton variant="outline" href={`/employees/${id}`}>{k.openEmployee}</LinkButton>}
            {(own || can(ctx, "receivables.post") || can(ctx, "receivables.view")) && <LinkButton variant="outline" href={`/receivables/cash/${id}`}><Wallet aria-hidden />{k.cash}</LinkButton>}
            {can(ctx, "sales.team") && <LinkButton href={`/order-takers/${id}/edit`}><Pencil aria-hidden />{k.edit}</LinkButton>}
          </>
        }
      />
      <div className="grid gap-6">
        <section className="flex flex-wrap items-start gap-6 rounded-2xl border bg-card p-5 shadow-card">
          <EmployeeAvatar name={taker.nameEn} url={photos.get(taker.photoPath ?? "")} className="size-24 text-2xl" />
          <div className="min-w-0 flex-1 basis-64">
            <DescriptionList items={[
              { label: k.territory, value: taker.territory },
              { label: k.status, value: t.employees.statusLabels[taker.status] },
              { label: k.phone, value: taker.phone && <Ltr>{taker.phone}</Ltr> },
              { label: k.whatsapp, value: taker.whatsapp && <Ltr>{taker.whatsapp}</Ltr> },
              ...(taker.notes ? [{ label: t.documents.notes, value: taker.notes }] : []),
            ]} />
          </div>
        </section>
        {f && (
          <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={k.performance} description={k.performanceHint}>
            <StatGrid>
              <StatCard label={k.orders} value={count(f.orders)} icon={ShoppingCart} hint={<>{k.orderValue}: {money(f.order_value)}</>} href={can(ctx, "sales.view") ? `/sales/orders?taker=${id}` : undefined} />
              <StatCard label={k.totalSales} value={money(f.total_sales)} icon={TrendingUp} />
              <StatCard label={k.delivered} value={count(f.delivered_orders)} icon={CircleCheck} hint={<>{k.open}: {count(f.open_orders)}</>} />
              <StatCard label={k.cancelled} value={count(f.cancelled_orders)} icon={CircleX} />
              <StatCard label={k.collected} value={money(f.collected)} icon={Banknote} />
              <StatCard label={k.pending} value={money(f.pending_collections)} icon={HandCoins} hint={k.pendingHint} />
              <StatCard label={k.cashHeld} value={money(f.cash_held)} icon={Wallet} hint={k.cashHeldHint} tone={f.cash_held !== null && toPaisa(f.cash_held) > BigInt(0) ? "attention" : "default"} />
              <StatCard label={k.customers} value={count(f.customers)} icon={Users} />
            </StatGrid>
          </PeriodFrame>
        )}
        {can(ctx, "customers.view") && (
          <section className="grid gap-3">
            <h2 className="text-base font-semibold text-navy">{k.customers}</h2>
            <SpecTable
              caption={k.customers}
              rows={customers.rows.map((c) => ({ id: c.id, name: local(c.name, c.name_ur), nameHref: `/customers/${c.id}`, code: c.code, phone: c.phone, city: [c.area, c.city].filter(Boolean).join(", "), balance: c.balance }))}
              columns={[
                { key: "name", sub: "code", label: t.customers.name, kind: "link", primary: true }, { key: "phone", label: t.customers.phone, kind: "code" },
                { key: "city", label: t.customers.city, kind: "text" }, ...(can(ctx, "receivables.view") ? [{ key: "balance", label: t.customers.balance, kind: "money" as const }] : []),
              ]}
              server={{ page: filter.page, pageSize: LIST_PAGE, total: customers.total }}
              empty={{ title: k.noCustomers }}
            />
          </section>
        )}
      </div>
    </>
  );
}
