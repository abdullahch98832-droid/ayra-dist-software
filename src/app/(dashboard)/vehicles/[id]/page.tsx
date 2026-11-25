import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Coins, Fuel, Gauge, Pencil, Phone, Truck, Wrench } from "lucide-react";
import { businessToday, parsePeriod } from "@/features/dashboard/period";
import { loadExpenses } from "@/features/expenses/queries";
import { loadDriverList, loadVehicle, reportVehicleLog, reportVehicles, vehiclesOnTrip } from "@/features/fleet/queries";
import { documentOptions } from "@/features/sales/status";
import { VEHICLE_TONE } from "@/features/sol/status";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { formatPaisa, toPaisa } from "@/lib/utils/money";
import { phoneHref } from "@/lib/utils/phone";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr } from "@/components/shared/bidi";
import { DescriptionList } from "@/components/shared/description-list";
import { formatDate, formatNumber } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { StatGrid } from "@/components/shared/stat-grid";
import { StatusBadge } from "@/components/shared/status-badge";
import { SpecTable } from "@/components/tables/spec-table";
import { TripsTable } from "../trips-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).vehicles.title };
}

export default async function VehiclePage({ params, searchParams }: PageProps<"/vehicles/[id]">) {
  const { id, ctx, t, locale, local } = await pageContext(params);
  if (!can(ctx, "vehicles.view")) return <Forbidden />;
  const x = await loadVehicle(id);
  if (!x) notFound();
  const v = t.vehicles;
  const today = businessToday();
  const period = parsePeriod(await searchParams, today);
  const seesExpenses = can(ctx, "expenses.view");
  const [drivers, [use], trips, busy, spent] = await Promise.all([
    loadDriverList(), reportVehicles(period, id), reportVehicleLog(period, id), vehiclesOnTrip(),
    seesExpenses ? loadExpenses({ q: "", status: "", page: 1, supplierId: null, vehicleId: id }) : { rows: [], total: 0 },
  ]);
  const driver = drivers.find((d) => d.id === x.driver_id);
  const tel = phoneHref(driver?.phone ?? null);
  const expired = driver?.licenseExpiry != null && driver.licenseExpiry < today;
  const money = (n: number | null | undefined) => (n === null || n === undefined ? null : <Ltr>{formatPaisa(toPaisa(n), locale)}</Ltr>);
  const n = (value: number | undefined) => formatNumber(value ?? 0, locale);
  return (
    <>
      <PageHeader
        title={x.registration_no}
        breadcrumbs={[{ label: v.title, href: "/vehicles" }]}
        description={
          <span className="flex flex-wrap items-center gap-3">
            <StatusBadge tone={VEHICLE_TONE[x.status] ?? "gray"}>{v.statuses[x.status as "active"]}</StatusBadge>
            {busy.has(id) && <StatusBadge tone="blue">{v.onTrip}</StatusBadge>}
            <bdi>{x.name}</bdi>
          </span>
        }
        actions={
          <>
            {can(ctx, "vehicles.manage") && <LinkButton variant="outline" href={`/vehicles/${id}/edit`}><Pencil aria-hidden />{v.edit}</LinkButton>}
            {can(ctx, "expenses.create") && <LinkButton href={`/expenses/new?vehicle=${id}`}><Coins aria-hidden />{v.addExpense}</LinkButton>}
          </>
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        <SectionCard title={v.details} action={tel && <a href={tel} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><Phone className="size-4" aria-hidden />{t.customers.call}</a>}>
          <DescriptionList items={[
            { label: v.type, value: x.vehicle_type }, { label: `${v.make} / ${v.model}`, value: [x.make, x.model].filter(Boolean).join(" ") },
            { label: v.driver, value: driver && local(driver.nameEn, driver.nameUr) }, { label: v.driverContact, value: driver?.phone && <Ltr>{driver.phone}</Ltr> },
            { label: v.license, value: driver?.license && <><Ltr>{driver.license}</Ltr> {driver.licenseExpiry && <span className={expired ? "text-destructive" : "text-muted-foreground"}>{expired ? v.licenseExpired : <bdi>{formatDate(driver.licenseExpiry, locale)}</bdi>}</span>}</> },
            { label: v.fuelType, value: x.fuel_type && v.fuels[x.fuel_type as "petrol"] }, { label: v.ownership, value: v.ownerships[x.ownership] }, { label: v.capacity, value: x.capacity }, { label: t.documents.notes, value: x.notes },
          ]} />
        </SectionCard>
        <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={v.use} description={v.useHint}>
          <StatGrid>
            <StatCard label={v.solTrips} value={n(use?.sol_deliveries)} icon={Truck} hint={`${v.jobs}: ${n(use?.jobs)}`} />
            <StatCard label={v.salesTrips} value={n(use?.sales_deliveries)} icon={Truck} />
            <StatCard label={v.distance} value={n(use?.distance)} icon={Gauge} />
            {seesExpenses && (
              <>
                <StatCard label={v.fuel} value={money(use?.fuel)} icon={Fuel} hint={use?.litres ? `${v.litres}: ${formatNumber(use.litres, locale)}` : undefined} />
                <StatCard label={v.maintenance} value={money(use?.maintenance)} icon={Wrench} />
                <StatCard label={v.repairs} value={money(use?.repairs)} icon={Wrench} />
                <StatCard label={v.other} value={money(use?.other)} icon={Coins} />
                <StatCard label={v.total} value={money(use?.total)} icon={Coins} hint={<>{v.forJobs}: {money(use?.for_jobs)}</>} />
              </>
            )}
          </StatGrid>
          <h3 className="text-base font-semibold text-navy">{v.trips}</h3>
          <TripsTable t={t} local={local} rows={trips} oneVehicle canOpen={{ sol: can(ctx, "sol.view"), sales: can(ctx, "sales.view") || can(ctx, "sales.view_all") }} />
        </PeriodFrame>
        {seesExpenses && (
          <section className="grid gap-3">
            <div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-navy">{v.expenses}</h2><LinkButton variant="outline" size="sm" href={`/expenses?vehicle=${id}`}>{t.common.all}</LinkButton></div>
            <SpecTable
              caption={v.expenses}
              rows={spent.rows.slice(0, 10).map((e) => ({ id: e.id, no: e.doc_no, noHref: `/expenses/${e.id}`, date: e.expense_date, category: e.category && local(e.category.name_en, e.category.name_ur), payee: e.payee, job: e.job?.doc_no, odometer: e.odometer, litres: e.litres, amount: e.amount, status: e.status }))}
              columns={[
                { key: "no", label: t.documents.number, kind: "link", primary: true }, { key: "date", label: t.documents.date, kind: "date" }, { key: "category", sub: "payee", label: t.expenses.category, kind: "text" }, { key: "job", label: t.expenses.job, kind: "code", hideBelow: "lg" },
                { key: "litres", label: v.litres, kind: "decimal", hideBelow: "xl" }, { key: "odometer", label: t.expenses.odometer, kind: "quantity", hideBelow: "xl" }, { key: "amount", label: t.expenses.amount, kind: "money" }, { key: "status", label: t.common.status, kind: "status", options: documentOptions(t) },
              ]}
              empty={{ title: v.expenseEmpty }}
            />
          </section>
        )}
      </div>
    </>
  );
}
