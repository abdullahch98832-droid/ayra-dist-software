import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HandCoins, Scale, Wallet } from "lucide-react";
import { businessToday, parsePeriod } from "@/features/dashboard/period";
import { loadCash, loadCollectorStatement, seesAllCollections } from "@/features/receivables/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { formatPaisa, toPaisa } from "@/lib/utils/money";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr } from "@/components/shared/bidi";
import { formatDate } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { StatCard } from "@/components/shared/stat-card";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).receivables.statement };
}

export default async function CollectorPage({ params, searchParams }: PageProps<"/receivables/cash/[id]">) {
  const { id, ctx, t, locale, local } = await pageContext(params);
  if (!seesAllCollections(ctx) && !(can(ctx, "receivables.collect") && ctx.employeeId === id)) return <Forbidden />;
  const r = t.receivables;
  const today = businessToday();
  const period = parsePeriod(await searchParams, today);
  const [cash, lines] = await Promise.all([loadCash(), loadCollectorStatement(id, period.from, period.to)]);
  const holder = cash.find((c) => c.employee_id === id);
  if (!holder) notFound();
  const money = (v: number) => <Ltr>{formatPaisa(toPaisa(v), locale)}</Ltr>;
  const kinds: Record<string, string> = { customer_payment: r.payment, cash_deposit: r.deposit };
  return (
    <>
      <PageHeader
        title={local(holder.full_name, holder.full_name_ur)} description={r.statementHint} breadcrumbs={[{ label: r.tabs.cash, href: "/receivables/cash" }]}
        actions={(can(ctx, "receivables.post") || ctx.employeeId === id) && <LinkButton href={`/receivables/cash/deposit?taker=${id}`}><HandCoins aria-hidden />{r.newDeposit}</LinkButton>}
      />
      <div className="grid gap-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard label={r.held} value={money(holder.held)} icon={Wallet} />
          <StatCard label={r.waitingDeposits} value={money(holder.waiting_deposits)} icon={HandCoins} />
          <StatCard label={r.lastCount} value={holder.last_count ? money(holder.last_counted ?? 0) : "—"} icon={Scale} hint={holder.last_count ? <>{formatDate(holder.last_count, locale)} · {r.difference}: {money(holder.last_difference ?? 0)}</> : undefined} />
        </div>
        <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={r.statement} description={r.statementHint}>
          <SpecTable
            caption={r.statement}
            exportName={`cash-${period.from}-${period.to}`}
            rows={lines.map((l, i) => ({
              id: String(i), date: l.entry_date, kind: kinds[l.kind] ?? l.kind, note: l.is_reversal ? t.customers.reversal : null, doc: l.doc_no, docHref: l.kind === "customer_payment" && l.source_id ? `/receivables/payments/${l.source_id}` : "/receivables/cash",
              party: l.party ? local(l.party, l.party_ur) : null, received: toPaisa(l.received) === BigInt(0) ? null : l.received, handed: toPaisa(l.handed_over) === BigInt(0) ? null : l.handed_over, balance: l.balance,
            }))}
            columns={[
              { key: "date", label: r.date, kind: "date" }, { key: "doc", label: t.documents.number, kind: "link", primary: true }, { key: "kind", sub: "note", label: t.stock.kind, kind: "text" },
              { key: "party", label: t.sales.customer, kind: "text", hideBelow: "lg" }, { key: "received", label: r.received, kind: "money", total: true }, { key: "handed", label: r.handedOver, kind: "money", total: true },
              { key: "balance", label: r.held, kind: "money" },
            ]}
            searchKeys={["doc", "party"]}
            empty={{ title: r.statementEmpty }}
          />
        </PeriodFrame>
      </div>
    </>
  );
}
