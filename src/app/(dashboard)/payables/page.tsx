import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OTHER_VENDORS } from "@/config/vendors";
import { Factory, Wallet } from "lucide-react";
import { businessToday } from "@/features/dashboard/period";
import { accountPay, flowOf, flowPath } from "@/features/purchasing/flow";
import { reportSuppliers } from "@/features/reports/queries";
import { getLocale, getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { formatPaisa, sumPaisa, toPaisa } from "@/lib/utils/money";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr } from "@/components/shared/bidi";
import { StatCard } from "@/components/shared/stat-card";
import { StatGrid } from "@/components/shared/stat-grid";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).payables.title };
}

export default async function PayablesPage() {
  // Everything owed is owed to Ayra.
  if (!OTHER_VENDORS) redirect("/purchasing/company/account");
  const ctx = await requireActiveSession();
  if (!can(ctx, "payables.view") && !can(ctx, "company.view")) return <Forbidden />;
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const p = t.payables;
  const local = (en: string, ur: string | null) => (locale === "ur" && ur ? ur : en);
  const today = businessToday();
  const rows = await reportSuppliers({ preset: "custom", from: `${today.slice(0, 8)}01`, to: today });
  const total = (principal: boolean) => sumPaisa(rows.filter((r) => r.is_principal === principal).map((r) => toPaisa(r.closing)));
  const pays = (principal: boolean) => can(ctx, accountPay(flowOf(principal)));
  return (
    <>
      <PageHeader title={p.title} description={p.subtitle} />
      <div className="grid gap-6">
        <StatGrid>
          {can(ctx, "company.view") && <StatCard label={t.purchasing.flows.company} value={<Ltr>{formatPaisa(total(true), locale)}</Ltr>} icon={Factory} href={flowPath("company", "account")} />}
          {can(ctx, "payables.view") && <StatCard label={t.purchasing.flows.suppliers} value={<Ltr>{formatPaisa(total(false), locale)}</Ltr>} icon={Wallet} href={flowPath("suppliers", "account")} />}
        </StatGrid>
        <SpecTable
          caption={p.title}
          rows={rows.map((r) => {
            const flow = flowOf(r.is_principal);
            return {
              id: r.supplier_id, name: local(r.name, r.name_ur), code: r.code, nameHref: r.is_principal ? flowPath(flow, "account") : `${flowPath(flow, "account")}?supplier=${r.supplier_id}`,
              kind: r.is_principal ? "company" : "external", purchases: r.purchases, payments: r.payments, closing: r.closing, open: r.open_orders,
              pay: pays(r.is_principal) ? t.purchasing.newPayment : null, payHref: `${flowPath(flow, "payments", "new")}?supplier=${r.supplier_id}`,
            };
          })}
          columns={[
            { key: "name", sub: "code", label: t.documents.supplier, kind: "link", primary: true },
            { key: "kind", label: t.stock.kind, kind: "status", hideBelow: "lg", options: { company: { label: t.suppliers.mainCompany, tone: "blue" }, external: { label: t.suppliers.external, tone: "gray" } } },
            { key: "purchases", label: p.purchasesMonth, kind: "money", hideBelow: "lg", total: true },
            { key: "payments", label: p.paymentsMonth, kind: "money", hideBelow: "lg", total: true },
            ...(can(ctx, "purchasing.view") ? [{ key: "open", label: p.openOrders, kind: "money" as const, hideBelow: "xl" as const, total: true }] : []),
            { key: "closing", label: t.purchasing.outstanding, kind: "money", total: true },
            ...(pays(true) || pays(false) ? [{ key: "pay", label: t.purchasing.payment, kind: "link" as const }] : []),
          ]}
          searchKeys={["name", "code"]}
          empty={{ title: t.suppliers.empty }}
        />
      </div>
    </>
  );
}
