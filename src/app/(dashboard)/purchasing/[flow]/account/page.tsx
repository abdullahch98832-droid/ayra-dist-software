import type { Metadata } from "next";
import { Banknote } from "lucide-react";
import { businessToday, parsePeriod } from "@/features/dashboard/period";
import { accountPay, flowPath } from "@/features/purchasing/flow";
import { purchasingPage } from "@/features/purchasing/page-context";
import { loadBalances, loadFlowSuppliers, loadStatement, seesAccount } from "@/features/purchasing/queries";
import { isolate } from "@/i18n/format";
import { can } from "@/lib/auth/session";
import { formatPaisa, toPaisa } from "@/lib/utils/money";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Money } from "@/components/shared/bidi";
import { LinkButton } from "@/components/shared/link-button";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSelect } from "@/components/tables/url-filters";

export async function generateMetadata({ params }: PageProps<"/purchasing/[flow]/account">): Promise<Metadata> {
  return { title: (await purchasingPage(params)).t.purchasing.account };
}

export default async function AccountPage({ params, searchParams }: PageProps<"/purchasing/[flow]/account">) {
  const { flow, ctx, t, locale, local } = await purchasingPage(params);
  if (!seesAccount(ctx, flow)) return <Forbidden />;
  const p = t.purchasing;
  const query = await searchParams;
  const today = businessToday();
  const period = parsePeriod(query, today);
  const [suppliers, balances] = await Promise.all([loadFlowSuppliers(flow, true), loadBalances(flow)]);
  const supplier = suppliers.find((s) => s.id === query.supplier) ?? (suppliers.length === 1 ? suppliers[0] : undefined);
  const statement = supplier ? await loadStatement(supplier.id, period.from, period.to) : null;
  const opening = toPaisa(statement?.opening ?? 0);
  return (
    <>
      <PageHeader
        title={p.account}
        description={supplier
          ? <span className="flex flex-wrap items-baseline gap-x-3"><bdi>{local(supplier.nameEn, supplier.nameUr)}</bdi><span>{p.outstanding}: <Money amount={toPaisa(balances[supplier.id] ?? "0")} locale={locale} className="font-semibold text-foreground" /></span></span>
          : p.chooseSupplier}
        actions={supplier && can(ctx, accountPay(flow)) && <LinkButton href={`${flowPath(flow, "payments", "new")}?supplier=${supplier.id}`}><Banknote aria-hidden />{p.newPayment}</LinkButton>}
      />
      <PeriodFrame
        key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today}
        title={supplier ? local(supplier.nameEn, supplier.nameUr) : p.account} description={supplier ? `${t.payables.opening}: ${isolate(formatPaisa(opening, locale))}` : p.chooseSupplier}
      >
        <SpecTable
          caption={p.account}
          rows={(statement?.lines ?? []).map((l, i) => ({
            id: String(i), date: l.entry_date, doc: l.doc_no, description: l.entry_description, debit: l.debit ? l.debit : null, credit: l.credit ? l.credit : null, balance: l.running_balance,
          }))}
          columns={[
            { key: "date", label: t.documents.date, kind: "date" },
            { key: "description", sub: "doc", label: p.description, kind: "text", primary: true },
            { key: "credit", label: p.credit, kind: "money", total: true },
            { key: "debit", label: p.debit, kind: "money", total: true },
            { key: "balance", label: p.balance, kind: "money" },
          ]}
          searchKeys={["doc", "description"]}
          exportName={supplier ? `statement-${supplier.nameEn}-${period.from}-${period.to}` : undefined}
          toolbar={suppliers.length > 1 && <UrlSelect param="supplier" label={p.chooseSupplier} options={suppliers.map((s) => ({ value: s.id, label: local(s.nameEn, s.nameUr) }))} />}
          empty={{ title: supplier ? p.accountEmpty : p.chooseSupplier }}
        />
      </PeriodFrame>
    </>
  );
}
