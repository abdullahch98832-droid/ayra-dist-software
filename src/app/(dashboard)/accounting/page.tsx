import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CircleCheck, Factory, HandCoins, Landmark, Scale, ScrollText, TriangleAlert, Truck, Wallet, type LucideIcon } from "lucide-react";
import { loadBalances, loadChart, loadChecks, seesLedgers, seesStatements } from "@/features/accounting/queries";
import { OTHER_VENDORS } from "@/config/vendors";
import { fill } from "@/i18n/format";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { formatPaisa, toPaisa } from "@/lib/utils/money";
import { FormAlert } from "@/components/forms/field";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr } from "@/components/shared/bidi";
import { formatNumber } from "@/components/shared/format";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { StatGrid } from "@/components/shared/stat-grid";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).accounting.title };
}

export default async function AccountingOverview() {
  const { ctx, t, locale } = await pageContext();
  const a = t.accounting;
  const ledgers = seesLedgers(ctx);
  const [checks, chart, balances] = await Promise.all([ledgers || seesStatements(ctx) ? loadChecks() : [], ledgers ? loadChart() : [], loadBalances(ctx)]);
  const failed = checks.filter((c) => toPaisa(c.ledger) !== toPaisa(c.documents)).length;
  const of = (key: string) => { const x = chart.find((c) => c.system_key === key); return x ? toPaisa(balances.get(x.id) ?? 0) : BigInt(0); };
  const money = (v: bigint) => <Ltr>{formatPaisa(v, locale)}</Ltr>;
  const links: { href: string; label: string; icon: LucideIcon; show: boolean }[] = [
    { href: "/receivables", label: a.receivables, icon: HandCoins, show: can(ctx, "receivables.view") }, { href: "/payables", label: a.payables, icon: Truck, show: OTHER_VENDORS && (can(ctx, "payables.view") || can(ctx, "company.view")) },
    { href: "/purchasing/company/account", label: a.company, icon: Factory, show: can(ctx, "company.view") }, { href: "/cash-bank/book?kind=cash", label: a.cashBook, icon: Wallet, show: ledgers || can(ctx, "cash_bank.view") },
    { href: "/cash-bank/book?kind=bank", label: a.bankBook, icon: Landmark, show: ledgers || can(ctx, "cash_bank.view") }, { href: "/accounting/ledger", label: a.tabs.ledger, icon: BookOpen, show: ledgers },
    { href: "/accounting/journal", label: a.tabs.journal, icon: ScrollText, show: ledgers }, { href: "/accounting/trial-balance", label: a.tabs.trial, icon: Scale, show: seesStatements(ctx) },
  ];
  return (
    <>
      <PageHeader title={a.title} description={a.subtitle} />
      <div className="grid gap-6">
        {checks.length > 0 && (
          <Link href="/accounting/checks" className="block rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/40">
            <FormAlert tone={failed ? "error" : "success"}>{failed ? fill(a.someDiffer, { count: formatNumber(failed, locale) }) : a.allAgree}</FormAlert>
          </Link>
        )}
        {ledgers && (
          <StatGrid>
            <StatCard label={a.receivables} value={money(of("AR"))} icon={HandCoins} href={can(ctx, "receivables.view") ? "/receivables" : undefined} />
            {(OTHER_VENDORS || of("AP_SUPPLIERS") !== BigInt(0)) && <StatCard label={a.payables} value={money(of("AP_SUPPLIERS"))} icon={Truck} href={OTHER_VENDORS && can(ctx, "payables.view") ? "/payables" : undefined} />}
            <StatCard label={a.company} value={money(of("AP_PRINCIPAL"))} icon={Factory} href={can(ctx, "company.view") ? "/purchasing/company/account" : undefined} />
            <StatCard label={a.checks} value={failed ? formatNumber(failed, locale) : a.agrees} icon={failed ? TriangleAlert : CircleCheck} tone={failed ? "attention" : "default"} href="/accounting/checks" />
          </StatGrid>
        )}
        <SectionCard title={a.books}>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {links.filter((l) => l.show).map(({ href, label, icon: Icon }) => (
              <li key={href}><Link href={href} className="flex items-center gap-3 rounded-lg border px-3 py-3 outline-none transition-colors hover:border-primary/40 hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/40"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-4.5" aria-hidden /></span><span className="min-w-0 text-sm font-medium">{label}</span></Link></li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </>
  );
}
