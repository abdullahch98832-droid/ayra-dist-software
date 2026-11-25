import type { Metadata } from "next";
import { Phone } from "lucide-react";
import { businessToday, parsePeriod } from "@/features/dashboard/period";
import { seesSettlements } from "@/features/sales/access";
import { reportSolOrders } from "@/features/sol/queries";
import { ORDER_STEPS, stepOptions } from "@/features/sol/status";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/shared/link-button";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSelect } from "@/components/tables/url-filters";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).distributor.title };
}

const STEPS = ["draft", ...ORDER_STEPS, "cancelled"] as const;

export default async function DistributorOrdersPage({ searchParams }: PageProps<"/sol/orders">) {
  const { ctx, t, local } = await pageContext();
  if (!can(ctx, "sol.view")) return <Forbidden />;
  const o = t.distributor;
  const query = await searchParams;
  const today = businessToday();
  const period = parsePeriod(query.range ? query : { ...query, range: "last12Months" }, today);
  const step = STEPS.find((x) => x === query.step);
  const rows = (await reportSolOrders({ from: period.from, to: period.to })).filter((x) => !step || x.step === step);
  const add = can(ctx, "sol.manage") && <LinkButton href="/sol/orders/new"><Phone aria-hidden />{o.new}</LinkButton>;
  const paid = seesSettlements(ctx);
  const costs = can(ctx, "costs.view");
  return (
    <>
      <PageHeader title={o.title} description={o.hint} actions={add} />
      <PeriodFrame compact key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={o.title} description={o.progress}>
        <SpecTable
          caption={o.title}
          rows={rows.map((x) => ({
            id: x.job_id, no: x.doc_no, noHref: `/sol/orders/${x.job_id}`, date: x.job_date, distributor: local(x.customer, x.customer_ur), city: x.city, caller: x.contact_name, phone: x.contact_phone,
            needed: x.needed, received: x.received, supplied: x.supplied, sale: x.sale, pending: x.pending, profit: x.profit, step: x.step,
          }))}
          columns={[
            { key: "no", label: o.number, kind: "link", primary: true }, { key: "date", label: o.callDate, kind: "date", hideBelow: "lg" }, { key: "distributor", sub: "city", label: o.distributor, kind: "text" }, { key: "caller", sub: "phone", label: o.caller, kind: "text", hideBelow: "2xl" },
            { key: "needed", label: o.needed, kind: "quantity", hideBelow: "2xl", total: true }, { key: "received", label: o.receivedQty, kind: "quantity", hideBelow: "2xl", total: true }, { key: "supplied", label: o.suppliedQty, kind: "quantity", hideBelow: "lg", total: true },
            { key: "sale", label: o.sale, kind: "money", total: true }, ...(paid ? [{ key: "pending", label: o.pending, kind: "money" as const, hideBelow: "xl" as const, total: true }] : []), ...(costs ? [{ key: "profit", label: o.profit, kind: "money" as const, hideBelow: "xl" as const, total: true }] : []),
            { key: "step", label: o.step, kind: "status", options: stepOptions(t) },
          ]}
          searchKeys={["no", "distributor", "city", "caller", "phone"]} searchPlaceholder={o.search}
          toolbar={<UrlSelect param="step" label={o.allSteps} options={STEPS.map((x) => ({ value: x, label: o.steps[x] }))} />}
          empty={{ title: o.empty, description: o.emptyHint, action: add }}
        />
      </PeriodFrame>
    </>
  );
}
